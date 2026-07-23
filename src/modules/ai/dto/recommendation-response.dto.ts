import { ApiProperty } from '@nestjs/swagger';
import { RecommendationPriority, RecommendationCategory } from '../interfaces/recommendation.interface';

export class RecommendationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  campaignId: string;

  @ApiProperty({ enum: RecommendationCategory })
  type: RecommendationCategory;

  @ApiProperty()
  description: string;

  @ApiProperty({ enum: RecommendationPriority })
  priority: RecommendationPriority;

  @ApiProperty()
  confidence: number;

  @ApiProperty()
  reason: string;

  @ApiProperty()
  expectedImpact: string;

  @ApiProperty()
  createdAt: Date;
}
