import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<{ status: string; data: unknown }> {
    return next.handle().pipe(
      map((data) => {
        const response = context
          .switchToHttp()
          .getResponse<{ statusCode: number }>();
        const status = response.statusCode === 201 ? 'created' : 'success';
        return { status, data };
      }),
    );
  }
}
