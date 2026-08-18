import { of } from 'rxjs';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

describe('ResponseEnvelopeInterceptor', () => {
  const interceptor = new ResponseEnvelopeInterceptor();

  function makeContext(statusCode: number): ExecutionContext {
    return {
      switchToHttp: () => ({
        getResponse: () => ({ statusCode }),
      }),
    } as unknown as ExecutionContext;
  }

  function makeHandler(value: unknown): CallHandler {
    return { handle: () => of(value) };
  }

  it('wraps 200 responses as status "success"', (done) => {
    interceptor
      .intercept(makeContext(200), makeHandler({ id: 1 }))
      .subscribe((result) => {
        expect(result).toEqual({ status: 'success', data: { id: 1 } });
        done();
      });
  });

  it('wraps 201 responses as status "created"', (done) => {
    interceptor
      .intercept(makeContext(201), makeHandler({ id: 1 }))
      .subscribe((result) => {
        expect(result).toEqual({ status: 'created', data: { id: 1 } });
        done();
      });
  });
});
