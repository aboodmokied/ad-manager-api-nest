import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Platform } from '@prisma/client';
import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ThrottleGuard } from 'src/common/guards/throttle.guard';
import { Throttle } from 'src/common/decorators/throttle.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { AccountsService } from './services/accounts.service';
import { ConnectAdAccountDto } from './dto/connect-ad-account.dto';
import { ReconnectAdAccountDto } from './dto/reconnect-ad-account.dto';
import {
  CampaignImportResultDto,
  ConnectResultDto,
  ConnectedAccountViewDto,
  ImportedCampaignViewDto,
  PlatformDescriptorDto,
} from './dto/accounts-response.dto';

/**
 * Advertising account linking (FR-10/FR-14).
 *
 * Two entry points start the OAuth flow:
 * - GET  /ad-accounts/connect/:platform  full browser redirect;
 * - POST /ad-accounts/connect           JSON, returns the authorization URL.
 *
 * The provider sends the user back to GET /ad-accounts/oauth/callback, which
 * verifies the state, exchanges the code, stores credentials (encrypted) and
 * redirects to the frontend with either the linked account or an error.
 */
@ApiTags('ad-accounts')
@Controller('ad-accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  // Platform selection
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 30, windowMs: 60_000 })
  @UseGuards(JwtAuthGuard)
  @Get('platforms')
  @ApiOperation({ summary: 'List supported advertising platforms' })
  @ApiResponse({
    status: 200,
    description: 'Supported platforms with their OAuth scopes',
    type: [PlatformDescriptorDto],
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  listPlatforms(): PlatformDescriptorDto[] {
    return this.accountsService.listSupportedPlatforms();
  }

  // OAuth authorization
  @UseGuards(JwtAuthGuard, ThrottleGuard)
  @Throttle({ limit: 10, windowMs: 60_000 })
  @Post('connect')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Start OAuth linking for a platform (returns the authorization URL)',
  })
  @ApiBody({ type: ConnectAdAccountDto })
  @ApiResponse({
    status: 200,
    description: 'Authorization URL the browser must be redirected to',
    type: ConnectResultDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or session expired',
  })
  @ApiResponse({
    status: 500,
    description: 'Platform is not configured (missing env variables)',
  })
  @HttpCode(HttpStatus.OK)
  connect(
    @CurrentUser() user: { sub: string; email: string },
    @Body() dto: ConnectAdAccountDto,
  ) {
    return this.accountsService.startConnect(user, dto);
  }

  @UseGuards(JwtAuthGuard, ThrottleGuard)
  @Throttle({ limit: 10, windowMs: 60_000 })
  @Get('connect/:platform')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Start OAuth linking (302 redirect to the provider consent screen)',
  })
  @ApiParam({
    name: 'platform',
    enum: Platform,
    description: 'Platform to connect',
  })
  @ApiResponse({ status: 302, description: 'Redirect to the provider' })
  @ApiResponse({ status: 400, description: 'Invalid platform' })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or session expired',
  })
  async connectRedirect(
    @CurrentUser() user: { sub: string; email: string },
    @Param('platform', new ParseEnumPipe(Platform)) platform: Platform,
    @Res() res: Response,
  ): Promise<void> {
    res.redirect(await this.accountsService.startConnectUrl(user, platform));
  }

  // OAuth callback
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 20, windowMs: 60_000 })
  @Get('oauth/callback')
  @ApiOperation({
    summary:
      'OAuth callback - verifies state, exchanges the code, stores credentials and redirects to the frontend',
  })
  @ApiQuery({
    name: 'code',
    required: false,
    description: 'Authorization code returned by the provider',
  })
  @ApiQuery({
    name: 'state',
    required: false,
    description: 'OAuth state token issued when the flow started',
  })
  @ApiQuery({
    name: 'error',
    required: false,
    description: 'Error reported by the provider (e.g. access_denied)',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirect to the frontend (success or failure page)',
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async oauthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') oauthError: string,
    @Res() res: Response,
  ): Promise<void> {
    res.redirect(
      await this.accountsService.handleCallback(code, state, oauthError),
    );
  }

  // Connection management
  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List connection status for all platforms' })
  @ApiResponse({
    status: 200,
    description: 'Per-platform connection status (tokens never included)',
    type: [ConnectedAccountViewDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or session expired',
  })
  list(@CurrentUser() user: { sub: string }) {
    return this.accountsService.list(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the connection status of one account' })
  @ApiParam({ name: 'id', description: 'Connected account id' })
  @ApiResponse({
    status: 200,
    description: 'Account status',
    type: ConnectedAccountViewDto,
  })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or session expired',
  })
  detail(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.accountsService.detail(user.sub, id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disconnect an advertising account' })
  @ApiParam({ name: 'id', description: 'Connected account id' })
  @ApiResponse({ status: 200, description: 'Account disconnected' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or session expired',
  })
  @HttpCode(HttpStatus.OK)
  disconnect(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.accountsService.disconnect(user.sub, id);
  }

  @UseGuards(JwtAuthGuard, ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 60_000 })
  @Post(':id/refresh')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Force a token refresh (fails with 409 when reauthorization is required)',
  })
  @ApiParam({ name: 'id', description: 'Connected account id' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @ApiResponse({
    status: 409,
    description: 'Reauthorization required - reconnect the account',
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or session expired',
  })
  @HttpCode(HttpStatus.OK)
  refresh(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.accountsService.refresh(user.sub, id);
  }

  @UseGuards(JwtAuthGuard, ThrottleGuard)
  @Throttle({ limit: 10, windowMs: 60_000 })
  @Post(':id/reconnect')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Start a new OAuth flow for an existing account (re-connect action)',
  })
  @ApiParam({ name: 'id', description: 'Connected account id' })
  @ApiBody({ type: ReconnectAdAccountDto })
  @ApiResponse({
    status: 200,
    description: 'Authorization URL the browser must be redirected to',
    type: ConnectResultDto,
  })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or session expired',
  })
  @HttpCode(HttpStatus.OK)
  reconnect(
    @CurrentUser() user: { sub: string; email: string },
    @Param('id') id: string,
    @Body() dto: ReconnectAdAccountDto,
  ) {
    return this.accountsService.reconnect(user, id, dto);
  }

  @UseGuards(JwtAuthGuard, ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 60_000 })
  @Post(':id/import')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Import campaigns from the platform now (manual re-run)',
  })
  @ApiParam({ name: 'id', description: 'Connected account id' })
  @ApiResponse({
    status: 200,
    description: 'Import finished with counters',
    type: CampaignImportResultDto,
  })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @ApiResponse({
    status: 409,
    description: 'Reauthorization required - reconnect the account',
  })
  @HttpCode(HttpStatus.OK)
  importNow(@CurrentUser() user: { sub: string }, @Param('id') id: string) {
    return this.accountsService.importNow(user.sub, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/campaigns')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List campaigns imported from the platform for an account',
  })
  @ApiParam({ name: 'id', description: 'Connected account id' })
  @ApiResponse({
    status: 200,
    description: 'Imported campaigns',
    type: [ImportedCampaignViewDto],
  })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or session expired',
  })
  importedCampaigns(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
  ) {
    return this.accountsService.listImportedCampaigns(user.sub, id);
  }
}
