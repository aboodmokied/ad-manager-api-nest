import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JevService } from './jev.service';
import { AgentExecutorService } from './agent-executor.service';
import { AgentController } from './agent.controller';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [AgentController],
  providers: [JevService, AgentExecutorService],
  exports: [JevService, AgentExecutorService],
})
export class AgentModule {}
