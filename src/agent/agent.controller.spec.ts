import { Test, TestingModule } from '@nestjs/testing';
import { AgentController } from './agent.controller';
import { AgentExecutorService } from './agent-executor.service';
import { ExecuteAgentDto } from './dto/execute-agent.dto';

describe('AgentController', () => {
  let controller: AgentController;
  let executorService: AgentExecutorService;

  const mockAgentExecutorService = {
    execute: jest.fn(),
  };

  beforeEach(async () => {
    mockAgentExecutorService.execute.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        {
          provide: AgentExecutorService,
          useValue: mockAgentExecutorService,
        },
      ],
    }).compile();

    controller = module.get<AgentController>(AgentController);
    executorService = module.get<AgentExecutorService>(AgentExecutorService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate query execution to AgentExecutorService', async () => {
    const dto: ExecuteAgentDto = { query: 'Get user info for Alice' };
    const mockResponse: any = {
      success: true,
      query: dto.query,
      routing: {
        selectedTool: 'get_user_info',
        confidence: 0.97,
        probabilities: { get_user_info: 0.97 },
      },
      data: { userId: 'usr_mock_001' },
      timestamp: '2026-09-21T21:00:00.000Z',
    };

    mockAgentExecutorService.execute.mockResolvedValueOnce(mockResponse);

    const result = await controller.execute(dto);

    expect(result).toBe(mockResponse);
    expect(mockAgentExecutorService.execute).toHaveBeenCalledWith(dto.query);
  });
});
