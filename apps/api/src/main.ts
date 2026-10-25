import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Bootstrap function to start the NestJS application
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global API prefix with health endpoint exclusion
  app.setGlobalPrefix('api/v1', {
    exclude: ['api/health', 'health'],
  });

  // Enable validation pipe for DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Global exception filters: specific first, catch-all last
  app.useGlobalFilters(
    new PrismaExceptionFilter(),
    new HttpExceptionFilter(),
    new AllExceptionsFilter(),
  );

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Unified Ad Campaign Manager (UACM) API')
    .setDescription(
      'API for managing ad campaigns across multiple platforms (Meta, Google, ' +
        'LinkedIn, X, Snapchat, TikTok)',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addTag('workspaces')
    .addTag('campaigns')
    .addTag('auth')
    .addTag('ad-accounts')
    .addTag('health')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 5020);
  await app.listen(port);
  Logger.log(
    `Swagger docs available at: http://localhost:${port}/docs`,
    'Bootstrap',
  );
}
bootstrap();
