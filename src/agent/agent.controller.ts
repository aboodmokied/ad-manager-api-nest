import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AgentExecutorService } from './agent-executor.service';
import { ExecuteAgentDto } from './dto/execute-agent.dto';
import { AgentExecutionResponse } from './interfaces/agent.interface';

@ApiTags('agent')
@Controller('agent')
export class AgentController {
  constructor(private readonly agentExecutorService: AgentExecutorService) {}

  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Route and execute a query using Jev AI System One Router',
    description:
      'Classifies the input query into the best-matching tool using Jev model and executes the corresponding tool strategy.',
  })
  @ApiResponse({
    status: 200,
    description: 'Prompt classified and executed successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed - query is missing or empty.',
  })
  @ApiResponse({
    status: 500,
    description: 'Jev classification error or internal server exception.',
  })
  async execute(
    @Body() dto: ExecuteAgentDto,
  ): Promise<AgentExecutionResponse> {
    return this.agentExecutorService.execute(dto.query);
  }
}
