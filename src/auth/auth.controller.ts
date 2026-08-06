import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Response, Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { TwoFactorService } from './services/two-factor.service';
import { OAuthService } from './services/oauth.service';
import { PasswordService } from './services/password.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';
import { EnableTwoFactorDto } from './dto/enable-two-factor.dto';
import { DisableTwoFactorDto } from './dto/disable-two-factor.dto';
import { VerifyRecoveryCodeDto } from './dto/verify-recovery-code.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ThrottleGuard } from 'src/common/guards/throttle.guard';
import { Throttle } from 'src/common/decorators/throttle.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

/**
 * Authenticated request with the decoded JWT payload and raw token string,
 * populated by JwtAuthGuard on protected endpoints.
 */
export interface AuthenticatedRequest extends Request {
  user: { sub: string; email: string; type: string; jti: string };
  token: string;
}

/**
 * Controller for user account management and authentication.
 *
 * Single-service operations (2FA, OAuth, password) are routed directly to
 * the owning service. AuthService is only used for cross-service workflows
 * (register, login, verifyEmail, profile).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokenService: TokenService,
    private readonly twoFactorService: TwoFactorService,
    private readonly oauthService: OAuthService,
    private readonly passwordService: PasswordService,
  ) {}

  // ---------------------------------------------------------------------------
  // Registration & email verification
  // ---------------------------------------------------------------------------

  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 10, windowMs: 60_000 })
  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'Account created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or incomplete data' })
  @ApiResponse({ status: 409, description: 'Email is already registered' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.CREATED)
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 60_000 })
  @Get('verify-email')
  @ApiOperation({
    summary: 'Verify an email address using the emailed verification link',
  })
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'JWT verification token from the emailed link',
  })
  @ApiResponse({ status: 200, description: 'Email verified (HTML page)' })
  @ApiResponse({ status: 400, description: 'Invalid or expired link' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async verifyEmail(
    @Query('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const page = await this.authService.verifyEmailPage(token);
    res
      .status(page.statusCode)
      .setHeader('Content-Type', 'text/html')
      .send(page.html);
  }

  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 3, windowMs: 10 * 60_000 })
  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend the email verification link' })
  @ApiBody({ type: ResendVerificationDto })
  @ApiResponse({ status: 200, description: 'Verification link sent' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  resendVerification(@Body() resendVerificationDto: ResendVerificationDto) {
    return this.authService.resendVerification(resendVerificationDto.email);
  }

  // ---------------------------------------------------------------------------
  // Login & 2FA
  // ---------------------------------------------------------------------------

  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 10, windowMs: 10 * 60_000 })
  @Post('login')
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description:
      'Login successful (JWT returned, or loginToken when 2FA is required)',
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  @ApiResponse({ status: 403, description: 'Email not verified' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 60_000 })
  @Post('verify-2fa')
  @ApiOperation({
    summary: 'Verify two-factor authentication code to complete login',
  })
  @ApiBody({ type: VerifyTwoFactorDto })
  @ApiResponse({ status: 200, description: 'Code verified, JWT returned' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Invalid code or login token' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  verifyTwoFactor(@Body() verifyTwoFactorDto: VerifyTwoFactorDto) {
    return this.twoFactorService.verifyTwoFactor(
      verifyTwoFactorDto.loginToken,
      verifyTwoFactorDto.code,
    );
  }

  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 60_000 })
  @Post('2fa/recovery')
  @ApiOperation({
    summary: 'Complete a login using a one-time 2FA recovery code',
  })
  @ApiBody({ type: VerifyRecoveryCodeDto })
  @ApiResponse({
    status: 200,
    description: 'Recovery code verified, JWT returned',
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Invalid code or login token' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  verifyRecoveryCode(@Body() verifyRecoveryCodeDto: VerifyRecoveryCodeDto) {
    return this.twoFactorService.verifyRecoveryCode(
      verifyRecoveryCodeDto.loginToken,
      verifyRecoveryCodeDto.recoveryCode,
    );
  }

  // ---------------------------------------------------------------------------
  // Token management
  // ---------------------------------------------------------------------------

  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 30, windowMs: 60_000 })
  @Post('refresh')
  @ApiOperation({
    summary: 'Get a new access token using a valid refresh token',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: 'New token pair issued' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.tokenService.refresh(refreshTokenDto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log out and revoke the current session token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or session expired',
  })
  @HttpCode(HttpStatus.OK)
  logout(@Req() request: AuthenticatedRequest) {
    return this.tokenService.logout(request.token);
  }

  // ---------------------------------------------------------------------------
  // Profile
  // ---------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the currently authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Profile returned' })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or session expired',
  })
  profile(@CurrentUser() user: { sub: string }) {
    return this.authService.getProfile(user.sub);
  }

  // ---------------------------------------------------------------------------
  // 2FA management (requires authenticated session)
  // ---------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard, ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 60_000 })
  @Post('2fa/setup')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate a TOTP secret and otpauth URL to set up 2FA',
  })
  @ApiResponse({ status: 200, description: 'Secret and otpauth URL returned' })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or session expired',
  })
  @ApiResponse({ status: 409, description: '2FA is already enabled' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  setupTwoFactor(@CurrentUser() user: { sub: string }) {
    return this.twoFactorService.setupTwoFactor(user.sub);
  }

  @UseGuards(JwtAuthGuard, ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 60_000 })
  @Post('2fa/enable')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verify a TOTP code and enable 2FA on the account',
  })
  @ApiBody({ type: EnableTwoFactorDto })
  @ApiResponse({
    status: 200,
    description: '2FA enabled, recovery codes returned',
  })
  @ApiResponse({ status: 400, description: 'Invalid input or no setup first' })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or invalid code',
  })
  @ApiResponse({ status: 409, description: '2FA is already enabled' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  enableTwoFactor(
    @CurrentUser() user: { sub: string },
    @Body() enableTwoFactorDto: EnableTwoFactorDto,
  ) {
    return this.twoFactorService.enableTwoFactor(user.sub, enableTwoFactorDto);
  }

  @UseGuards(JwtAuthGuard, ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 60_000 })
  @Post('2fa/disable')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verify a TOTP code and password, then disable 2FA',
  })
  @ApiBody({ type: DisableTwoFactorDto })
  @ApiResponse({ status: 200, description: '2FA disabled successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or 2FA not enabled' })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or invalid code/password',
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  disableTwoFactor(
    @CurrentUser() user: { sub: string },
    @Body() disableTwoFactorDto: DisableTwoFactorDto,
  ) {
    return this.twoFactorService.disableTwoFactor(
      user.sub,
      disableTwoFactorDto,
    );
  }

  // ---------------------------------------------------------------------------
  // Password reset
  // ---------------------------------------------------------------------------

  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 3, windowMs: 10 * 60_000 })
  @Post('forgot-password')
  @ApiOperation({ summary: 'Send a password reset link to the user email' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, description: 'Reset link sent' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.passwordService.forgotPassword(forgotPasswordDto);
  }

  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 10 * 60_000 })
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset the password using a reset token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired reset link',
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.passwordService.resetPassword(resetPasswordDto);
  }

  @Get('reset-password')
  @ApiOperation({
    summary: 'Serve the password reset form (HTML page, linked from emails)',
  })
  @ApiResponse({ status: 200, description: 'Reset password form (HTML page)' })
  getResetPasswordPage(@Res() res: Response): void {
    res
      .status(HttpStatus.OK)
      .setHeader('Content-Type', 'text/html')
      .send(this.authService.getResetPasswordPage());
  }

  // ---------------------------------------------------------------------------
  // Google OAuth
  // ---------------------------------------------------------------------------

  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 10, windowMs: 60_000 })
  @Get('oauth/google')
  @ApiOperation({ summary: 'Start Google OAuth login (redirect to Google)' })
  @ApiResponse({
    status: 302,
    description: 'Redirect to Google consent screen',
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async oauthGoogle(@Res() res: Response): Promise<void> {
    res.redirect(await this.oauthService.getGoogleOAuthRedirectUrl());
  }

  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 10, windowMs: 60_000 })
  @Get('oauth/google/callback')
  @ApiOperation({
    summary:
      'Google OAuth callback - completes login and redirects to frontend',
  })
  @ApiQuery({
    name: 'code',
    required: false,
    description: 'Authorization code from Google',
  })
  @ApiQuery({
    name: 'state',
    required: false,
    description: 'OAuth state parameter',
  })
  @ApiQuery({
    name: 'error',
    required: false,
    description: 'Error returned by Google',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirect to frontend with tokens or an error',
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async oauthGoogleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') oauthError: string,
    @Res() res: Response,
  ): Promise<void> {
    res.redirect(
      await this.oauthService.handleGoogleOAuthCallbackRedirect(
        code,
        state,
        oauthError,
      ),
    );
  }
}
