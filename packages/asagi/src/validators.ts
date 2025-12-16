import type { StandardSchemaV1 } from '@standard-schema/spec';
import { parse } from 'cookie';
import type { InputSchemas, Middleware, ParsedInput, TypedOutput } from './types';

async function parseJsonBody(req: Request): Promise<unknown> {
  const clone = req.clone();
  try {
    return await clone.json();
  } catch {
    return undefined;
  }
}

async function parseFormBody(req: Request): Promise<Record<string, unknown>> {
  const clone = req.clone();
  try {
    const form = await clone.formData();
    const data: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      const current = data[key];
      if (current === undefined) {
        data[key] = value;
      } else if (Array.isArray(current)) {
        current.push(value);
      } else {
        data[key] = [current, value];
      }
    }
    return data;
  } catch {
    return {};
  }
}

function parseQuery(req: Request): Record<string, string> {
  const params = new URL(req.url).searchParams;
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

function parseHeaders(req: Request): Record<string, string> {
  const result: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function parseCookies(req: Request): Record<string, string | undefined> {
  const cookieHeader = req.headers.get('Cookie');
  const result = parse(cookieHeader || '');
  return result;
}

function formatIssues(issues: ReadonlyArray<StandardSchemaV1.Issue>, key: keyof InputSchemas) {
  return issues.map((issue) => ({
    ...issue,
    path: issue.path ? [key, ...issue.path] : [key],
  }));
}

async function validateValue<Schema extends StandardSchemaV1<any, any>>(
  schema: Schema,
  value: unknown
): Promise<StandardSchemaV1.Result<StandardSchemaV1.InferOutput<Schema>>> {
  return schema['~standard'].validate(value) as any;
}

export type ValidatorOutput = TypedOutput<'json', { error: string; issues: StandardSchemaV1.Issue[] }, 400>;

export function createInputValidator<S extends InputSchemas>(
  schemas: S
): Middleware<any, any, S, ValidatorOutput | undefined> {
  return async (c, next) => {
    const collected: Partial<ParsedInput<S>> = {};
    const issues: StandardSchemaV1.Issue[] = [];

    async function tryValidate<K extends keyof S>(key: K, value: unknown) {
      const schema = schemas[key];
      if (!schema) return;
      const schemaTyped = schema as unknown as StandardSchemaV1<any, any>;
      const result = await validateValue(schemaTyped, value);
      if (result.issues) {
        issues.push(...formatIssues(result.issues, key as keyof InputSchemas));
        return;
      }
      (collected as any)[key] = result.value;
    }

    if (schemas.json) {
      await tryValidate('json', await parseJsonBody(c.req));
    }

    if (schemas.form) {
      await tryValidate('form', await parseFormBody(c.req));
    }

    if (schemas.query) {
      await tryValidate('query', parseQuery(c.req));
    }

    if (schemas.params) {
      await tryValidate('params', c.params);
    }

    if (schemas.headers) {
      await tryValidate('headers', parseHeaders(c.req));
    }

    if (schemas.cookie) {
      await tryValidate('cookie', parseCookies(c.req));
    }

    if (issues.length > 0) {
      return c.json(
        {
          error: 'Invalid input',
          issues,
        },
        400
      );
    }

    (c as any)._input = {
      ...c.input,
      ...collected,
    };

    await next();
  };
}
