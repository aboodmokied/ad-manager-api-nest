import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JevService } from './jev.service';
import { InternalServerErrorException } from '@nestjs/common';

describe('JevService', () => {
  let service: JevService;
  let mockSystemOne: jest.Mock;

  beforeEach(async () => {
    mockSystemOne = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JevService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'TYPESAFE_API_KEY') {
                return 'test-api-key';
              }
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<JevService>(JevService);

    // Mock internal jevClient.systemOne method
    (service as any).jevClient = {
      systemOne: mockSystemOne,
    };
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should classify an action successfully', async () => {
    mockSystemOne.mockResolvedValueOnce({
      model: 'jev-1.13.0',
      answers: {
        action: {
          type: 'choice',
          choice: 'get_user_info',
          confidence: 0.98,
          probabilities: {
            get_user_info: 0.98,
            create_task: 0.02,
          },
        },
      },
      usage: {
        input_tokens: 250,
        output_tokens: 30,
      },
    });

    const tools = [
      { name: 'get_user_info', description: 'Get user details' },
      { name: 'create_task', description: 'Create task' },
    ];

    const result = await service.classifyAction('Find user info for John', tools);

    expect(result).toEqual({
      selectedTool: 'get_user_info',
      confidence: 0.98,
      probabilities: {
        get_user_info: 0.98,
        create_task: 0.02,
      },
      model: 'jev-1.13.0',
      usage: {
        input_tokens: 250,
        output_tokens: 30,
      },
    });
    expect(mockSystemOne).toHaveBeenCalledTimes(1);
  });

  it('should throw InternalServerErrorException if no tools are provided', async () => {
    await expect(service.classifyAction('Any prompt', [])).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('should throw InternalServerErrorException if client call fails', async () => {
    mockSystemOne.mockRejectedValueOnce(new Error('Network failure'));

    await expect(
      service.classifyAction('Any prompt', [
        { name: 'toolA', description: 'desc A' },
      ]),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
