import _ from "lodash";

export namespace Schemas {
    export function number(): SchemaBase<number> {
        return (key: string, val: any): number => {
            if (typeof val === "number") {
                return val;
            }
            throw new Error("Field " + key + " must be a number");
        };
    }

    export function string(opts: { nonEmpty?: boolean } = {}): SchemaBase<string> {
        const { nonEmpty } = opts;
        return (key: string, val: any): string => {
            if (typeof val === "string") {
                if (nonEmpty && val.length === 0) {
                    throw new Error("Field " + key + " cannot be an empty string");
                }
                return val;
            }
            throw new Error("Field " + key + " must be a string");
        };
    }

    export function literal<S extends string>(literal: S): SchemaBase<S> {
        const f: SchemaBase<S> = (key: string, val: any): S => {
            if (val !== literal) {
                throw new Error("Field " + key + " must be " + literal);
            }
            return literal;
        };
        return f as SchemaBase<S>;

    }

    export function nulll(): SchemaBase<null> {
        return (key: string, val: any): null => {
            if (val !== null) {
                throw new Error("Field " + key + " must be null");
            }
            return null;
        };
    }

    export function boolean(opts?: { val?: boolean }): SchemaBase<boolean> {
        const f: SchemaBase<boolean> = (key: string, val: any): boolean => {
            if (typeof val === "boolean") {
                if (opts && opts.val !== undefined && val !== opts.val) {
                    throw new Error("Field " + key + " must be " + opts.val);
                }
                return val;
            }
            throw new Error("Field " + key + " must be a boolean");
        };
        return f as SchemaBase<boolean>;
    }

    export function date(): SchemaBase<Date> {
        return (key: string, val: any): Date => {
            const date = new Date(val);
            if (_.isNaN(date.valueOf())) {
                throw new Error("Field " + key + " must be a date");
            }
            return date;
        };
    }

    export function optional<T>(schema: SchemaField<T>): SchemaBase<T> {
        return (key: string, val: any, validator: ChildValidator<T>): T | undefined => {
            if (val === undefined) {
                return undefined;
            }
            return validator(schema, key, val);
        };
    }

    export function values<T>(schema: SchemaField<T>): SchemaBase<{ [k: string]: T }> {
        return (key: string, val: any, validator: ChildValidator<T>): { [k: string]: T } => {
            if (!_.isPlainObject(val)) {
                throw new Error("Field " + key + " must be an object");
            }
            return _.mapValues(val, (innerVal, innerKey) => {
                return validator(schema, keyConcat(key, innerKey), innerVal);
            });
        };
    }

    export function or<A, B>(s1: SchemaField<A>, s2: SchemaField<B>): SchemaBase<A | B> {
        return (key: string, val: any, validator: ChildValidator<A | B>): A | B => {
            try {
                return validator(s1, key, val);
            } catch {
                return validator(s2, key, val);
            }
        };
    }

    export function baseArray<T>(innerType: SchemaBase<T>): SchemaBase<T[]> {
        return (key: string, val: any, validator: ChildValidator<T>): T[] => {
            if (!_.isArray(val)) {
                throw Error("Field " + key + " must be an array");
            }
            return _.map(val, (innerVal) => validator(innerType as SchemaField<T>, key, innerVal));
        };
    }

    export function array<T>(innerType: SchemaField<T>): SchemaBase<T[]> {
        return (key: string, val: any, validator: ChildValidator<T>): T[] => {
            if (!_.isArray(val)) {
                throw Error("Field " + key + " must be an array");
            }
            return _.map(val, (innerVal) => validator(innerType, key, innerVal));
        };
    }
}

type SchemaField<T> = SchemaType<T> | SchemaBase<T>;

/**
 * Validation functions, that the key and the value and return the type,
 * or throw an exception if the value fails validation.
 * 
 * They may use the passed in childValidator to validate any child nodes.
 */
export type SchemaBase<T, Q = any> = (k: string, v: any, childValidator: ChildValidator<Q>) => T;
type ChildValidator<T> = (childSchema: SchemaField<T>, k: string, v: any) => T;

/**
 * SchemaTypes describe the validation of a request or response object.
 */
export type SchemaType<R> = {
    [P in keyof R]: SchemaField<R[P]>;
};

function keyConcat(k: string, f: string): string {
    if (!k) {
        return f;
    }
    return `${k}.${f}`;
}

/**
 * An API contains all the information about a given endpoint; the request
 * path & method, and the types of the request and response.
 */
export class API<Request extends object, Response extends object | null> {
    constructor(
        public path: string,
        public requestSchema: SchemaType<Request>,
        public responseSchema: SchemaType<Response>,
    ) { }

    /**
     * Throws an error when the request does not match the schema.
     * @param request The data received from the client.
     */
    public reviveRequest(request: string): Request {
        if (request === "") {
            request = JSON.stringify(EmptyResponseValue);
        }
        try {
            return API.validateSchema(this.requestSchema, JSON.parse(request));
        } catch (e) {
            console.error("Schema validation failed for request " + this.path);
            throw e;
        }
    }

    /**
     * Throws an error when the request does not match the schema.
     * @param response The data received from the server.
     */
    public reviveResponse(response: string): Response {
        if (response === "") {
            response = JSON.stringify(EmptyResponseValue);
        }
        try {
            return API.validateSchema(this.responseSchema, JSON.parse(response));
        } catch (e) {
            console.error("Schema validation failed for response " + this.path);
            throw e;
        }
    }

    private static validateSchema<R extends object>(
        schema: SchemaType<R>, obj: any, key: string = ""): R {
        if (schema == null) {
            if (obj != null) {
                throw new Error("Object " + key + " must be null");
            }
            return null as R;
        }
        if (!_.isPlainObject(obj)) {
            throw Error("Object " + key + " must be an object");
        }
        _.forOwn(obj, (_v, field) => {
            if (!(field in schema)) {
                throw Error("Extraneous field " + field);
            }
        });
        return _.mapValues(schema, (s, f) => API.validateSchemaField(s, keyConcat(key, f), obj[f])) as R;
    }

    public static validateSchemaField<T>(schema: SchemaField<T>, key: string, val: any): T {
        if (_.isFunction(schema)) {
            return (schema as SchemaBase<T>)(key, val, API.validateSchemaField);
        }
        if (_.isPlainObject(schema)) {
            return API.validateSchema(schema as unknown as SchemaType<object>, val, key) as unknown as T;
        }
        throw Error("impossible for schema to be neither");
    }
}

/**
 * The Request type for the given API
 */
export type ApiRequest<A extends API<any, any>> = A extends API<infer R, any> ? R : any;

/**
 * The Response type for the given API
 */
export type ApiResponse<A extends API<any, any>> = A extends API<any, infer R> ? R : any;

export interface EmptyResponse {
    isEmptyResponse: boolean;
};
export const EmptyResponseValue: EmptyResponse = {
    isEmptyResponse: true,
};

/**
 * Use as the response schema for endpoints that have no response data.
 */
export const emptySchema: SchemaType<EmptyResponse> = {
    isEmptyResponse: Schemas.boolean({ val: true }) as SchemaBase<boolean>,
}
