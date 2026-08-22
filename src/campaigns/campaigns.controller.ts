import {
  Controller,
  Post,
  Body,
  Get,
  Headers,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { TokenPayload } from 'src/auth/interfaces/auth.interfaces';

/**
 * Controller for managing UACM campaigns.
 * Every route requires authentication; the owner is taken from the JWT,
 * never from the request body.
 */
@ApiTags('campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  /**
   * Creates a new UACM campaign and schedules it for creation on configured platforms
   */
  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new ad campaign' })
  @ApiResponse({ status: 201, description: 'Campaign created successfully' })
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
  ) {
    return this.campaignsService.create(
      user.sub,
      createCampaignDto,
      idempotencyKey,
    );
  }

  /**
   * Retrieves a campaign by its ID (only campaigns owned by the caller)
   */
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a campaign by ID' })
  @ApiParam({ name: 'id', description: 'UACM campaign ID' })
  @ApiResponse({ status: 200, description: 'Campaign found' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async findOne(@Param('id') id: string, @CurrentUser() user: TokenPayload) {
    const campaign = await this.campaignsService.findOne(user.sub, id);
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }
}
