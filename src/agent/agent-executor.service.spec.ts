import { Test, TestingModule } from '@nestjs/testing';
import { AgentExecutorService } from './agent-executor.service';
import { JevService } from './jev.service';

describe('AgentExecutorService', () => {
  let service: AgentExecutorService;
  let jevService: JevService;

  const mockJevService = {
    classifyAction: jest.fn(),
  };

  beforeEach(async () => {
    mockJevService.classifyAction.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentExecutorService,
        {
          provide: JevService,
          useValue: mockJevService,
        },
      ],
    }).compile();

    service = module.get<AgentExecutorService>(AgentExecutorService);
    jevService = module.get<JevService>(JevService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize with default tools', () => {
    const tools = service.getAvailableTools();
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain('get_user_info');
    expect(toolNames).toContain('create_task');
    expect(toolNames).toContain('campaign_analytics');
    expect(toolNames).toContain('fallback');
  });

  it('should route and execute get_user_info when classified by Jev', async () => {
    mockJevService.classifyAction.mockResolvedValueOnce({
      selectedTool: 'get_user_info',
      confidence: 0.95,
      probabilities: { get_user_info: 0.95, fallback: 0.05 },
      model: 'jev-1.13.0',
    });

    const response = await service.execute('Show details for John');

    expect(response.success).toBe(true);
    expect(response.routing.selectedTool).toBe('get_user_info');
    expect(response.data.tool).toBe('get_user_info');
    expect(response.data.data.email).toBe('john.doe@example.com');
  });

  it('should route and execute create_task when classified by Jev', async () => {
    mockJevService.classifyAction.mockResolvedValueOnce({
      selectedTool: 'create_task',
      confidence: 0.91,
      probabilities: { create_task: 0.91, fallback: 0.09 },
      model: 'jev-1.13.0',
    });

    const response = await service.execute('Remind me to call client tomorrow');

    expect(response.success).toBe(true);
    expect(response.routing.selectedTool).toBe('create_task');
    expect(response.data.tool).toBe('create_task');
    expect(response.data.data.status).toBe('PENDING');
  });

  it('should fallback gracefully when tool returned by Jev is not found', async () => {
    mockJevService.classifyAction.mockResolvedValueOnce({
      selectedTool: 'unknown_external_tool',
      confidence: 0.5,
      probabilities: { unknown_external_tool: 0.5 },
      model: 'jev-1.13.0',
    });

    const response = await service.execute('Random unsupported question');

    expect(response.success).toBe(true);
    expect(response.data.tool).toBe('fallback');
  });

  it('should allow dynamic tool registration', async () => {
    service.registerTool({
      name: 'custom_ping',
      description: 'Ping tool test',
      handler: async () => ({ pong: true }),
    });

    const tools = service.getAvailableTools();
    expect(tools.some((t) => t.name === 'custom_ping')).toBe(true);

    mockJevService.classifyAction.mockResolvedValueOnce({
      selectedTool: 'custom_ping',
      confidence: 0.99,
      probabilities: { custom_ping: 0.99 },
    });

    const result = await service.execute('ping test');
    expect(result.data).toEqual({ pong: true });
  });
});
