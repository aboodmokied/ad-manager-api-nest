import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestApplication } from '@nestjs/core';
import * as request from 'supertest';
import { HttpExceptionFilter } from './http-exception.filter';
import { AllExceptionsFilter } from './all-exceptions.filter';

@Controller('test')
class TestController {
  @Get('conflict')
  conflict() {
    throw new HttpException('Email is already registered', HttpStatus.CONFLICT);
  }

  @Get('error')
  error() {
    throw new Error('boom');
  }
}

describe('Exception filter ordering', () => {
  let app: NestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter(), new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('HttpException is mapped to its own status code', async () => {
    const res = await request(app.getHttpServer()).get('/test/conflict');
    expect(res.status).toBe(409);
  });

  it('unexpected errors become a generic 500', async () => {
    const res = await request(app.getHttpServer()).get('/test/error');
    expect(res.status).toBe(500);
  });
});
