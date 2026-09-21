import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ExecuteAgentDto {
  @ApiProperty({
    description: 'The user query or prompt to be classified and executed by Jev Agent',
    example: 'What is the email address of John Doe?',
  })
  @IsString()
  @IsNotEmpty()
  query: string;
}
