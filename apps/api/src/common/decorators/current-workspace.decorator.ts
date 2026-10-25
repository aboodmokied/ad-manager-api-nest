import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts the active workspace entity (or property) attached to the request
 * by WorkspaceContextInterceptor.
 */
export const CurrentWorkspace = createParamDecorator(
  (data: string | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    const workspace = request.workspace;
    if (!workspace) {
      return null;
    }
    return data ? workspace[data] : workspace;
  },
);
