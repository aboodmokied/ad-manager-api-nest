import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  Delete,
  Headers,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UseGuards,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CampaignStatus } from '@prisma/client';
import { Observable } from 'rxjs';
import { CampaignsService } from './services/campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { CampaignQueryDto } from './dto/campaign-query.dto';
import {
  CampaignResponseDto,
  PaginatedCampaignsResponseDto,
} from './dto/campaign-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TokenPayload } from '../auth/interfaces/auth.interfaces';

/**
 * Controller for managing UACM campaigns (FR-15, FR-16, FR-20, FR-21).
 * Every route requires authentication; the owner is taken from the JWT,
 * never from the request body.
 */
@ApiTags('campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  /**
   * Streams real-time campaign lifecycle events to the authenticated user via SSE.
   */
  @UseGuards(JwtAuthGuard)
  @Sse('events')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Stream real-time campaign lifecycle events via SSE' })
  streamEvents(@CurrentUser() user: TokenPayload): Observable<MessageEvent> {
    return this.campaignsService.getEventStream(user.sub);
  }

  /**
   * Creates a new UACM campaign and schedules it for creation on configured platforms
   */
  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new ad campaign' })
  @ApiResponse({
    status: 201,
    description: 'Campaign created successfully',
    type: CampaignResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({
    status: 409,
    description: 'A campaign already exists for this Idempotency-Key',
  })
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() createCampaignDto: CreateCampaignDto,
    @CurrentUser() user: TokenPayload,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ): Promise<CampaignResponseDto> {
    return this.campaignsService.create(
      user.sub,
      createCampaignDto,
      idempotencyKey,
    );
  }

  /**
   * Lists all campaigns owned by the authenticated user.
   * Supports pagination, status filtering, and sorting.
   */
  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all campaigns for the authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'List of campaigns with total count',
    type: PaginatedCampaignsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  findAll(
    @Query() query: CampaignQueryDto,
    @CurrentUser() user: TokenPayload,
  ) {
    return this.campaignsService.findAll(user.sub, query);
  }

  /**
   * Retrieves aggregated performance insights for a campaign.
   */
  @UseGuards(JwtAuthGuard)
  @Get(':id/insights')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get aggregated performance insights for a campaign' })
  @ApiParam({ name: 'id', description: 'UACM campaign ID' })
  @ApiResponse({ status: 200, description: 'Campaign insights retrieved' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  getInsights(@Param('id') id: string, @CurrentUser() user: TokenPayload) {
    return this.campaignsService.getInsights(user.sub, id);
  }

  /**
   * Retrieves a campaign by its ID (only campaigns owned by the caller)
   */
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a campaign by ID' })
  @ApiParam({ name: 'id', description: 'UACM campaign ID' })
  @ApiResponse({
    status: 200,
    description: 'Campaign found',
    type: CampaignResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: TokenPayload,
  ): Promise<CampaignResponseDto> {
    const campaign = await this.campaignsService.findOne(user.sub, id);
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  /**
   * Updates a campaign's fields and/or platform-specific configurations.
   * Publishes update events for platform campaigns already created upstream.
   */
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a campaign' })
  @ApiParam({ name: 'id', description: 'UACM campaign ID' })
  @ApiResponse({
    status: 200,
    description: 'Campaign updated successfully',
    type: CampaignResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  @HttpCode(HttpStatus.OK)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() user: TokenPayload,
  ): Promise<CampaignResponseDto> {
    return this.campaignsService.update(user.sub, id, dto);
  }

  /**
   * Pauses a campaign on all platforms.
   * Only campaigns in ACTIVE status can be paused.
   */
  @UseGuards(JwtAuthGuard)
  @Post(':id/pause')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Pause an active campaign' })
  @ApiParam({ name: 'id', description: 'UACM campaign ID' })
  @ApiResponse({
    status: 200,
    description: 'Campaign paused successfully',
    type: CampaignResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Campaign cannot be paused from its current status',
  })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  @HttpCode(HttpStatus.OK)
  pause(
    @Param('id') id: string,
    @CurrentUser() user: TokenPayload,
  ): Promise<CampaignResponseDto> {
    return this.campaignsService.pause(user.sub, id);
  }

  /**
   * Resumes a paused campaign on all platforms.
   * Only campaigns in PAUSED status can be resumed.
   */
  @UseGuards(JwtAuthGuard)
  @Post(':id/resume')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resume a paused campaign' })
  @ApiParam({ name: 'id', description: 'UACM campaign ID' })
  @ApiResponse({
    status: 200,
    description: 'Campaign resumed successfully',
    type: CampaignResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Campaign cannot be resumed from its current status',
  })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  @HttpCode(HttpStatus.OK)
  resume(
    @Param('id') id: string,
    @CurrentUser() user: TokenPayload,
  ): Promise<CampaignResponseDto> {
    return this.campaignsService.resume(user.sub, id);
  }

  /**
   * Deletes a campaign and all associated platform campaigns and metrics.
   */
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a campaign' })
  @ApiParam({ name: 'id', description: 'UACM campaign ID' })
  @ApiResponse({ status: 200, description: 'Campaign deleted successfully' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @CurrentUser() user: TokenPayload) {
    return this.campaignsService.remove(user.sub, id);
  }
}
