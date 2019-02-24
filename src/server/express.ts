import { Express, Handler as ExpressHandler, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { API, emptySchema } from "../shared/api";

export type ErrorResponse = { code: number, message: string };
export type Response<Res> = ErrorResponse | null | (Res extends object ? Res : never);
type Handler<Req, Res> = (req: Req, user: any) => Promise<Response<Res>>;

function isErrorResponse(r: Response<any>): r is ErrorResponse {
    return 'code' in r && 'message' in r;
}

// Wrap an async handler to be called synchronously
function wrap<Req extends object, Res extends (object | null), User = {}>(
    api: API<Req, Res>, handler: Handler<Req, Res>, userExtractor: UserExtractor<User>):
    (req: ExpressRequest, res: ExpressResponse) => void {
    return function (req: ExpressRequest, res: ExpressResponse) {
        let apiRequest: Req;
        try {
            apiRequest = api.reviveRequest(req.body);
        } catch (e) {
            console.error("Parsing request failed", e);
            res.status(400).send({
                "error": "Parsing request failed",
            });
            return;
        }
        const user = userExtractor ? userExtractor(req) : null;
        handler(apiRequest, user).then(apiResponse => {
            if (typeof (apiResponse) == "number") {
                res.sendStatus(apiResponse);
            } else if (apiResponse == null) {
                if (api.responseSchema != emptySchema) {
                    throw new Error("handler returned null, but " + api.path + " requires a response");
                }
                res.sendStatus(204);
            } else if (isErrorResponse(apiResponse)) {
                res.status(apiResponse.code).send({
                    "error": apiResponse.message,
                });
            } else {
                res.status(200).send(apiResponse);
            }
        }).catch((err) => {
            console.error("Error (caught)", err);
            const status = 500;
            res.status(status).send({
                "error": "internal server error",
            });
        });
    };
};

type UserExtractor<U> = (r: ExpressRequest) => U;
let userExtractor: UserExtractor<any>;

/**
 * To pass a user object into your handlers, call registerUserExtractor
 * to pull the user out of the express Request.
 * @param extractor takes a Request and returns the user.
 */
export function registerUserExtractor<U>(extractor: UserExtractor<U>) {
    userExtractor = extractor;
}

/**
 * If you use passport.js middleware, call registerPassportUserExtractor before any register calls
 * to pass the user into your handler calls.
 */
export function registerPassportUserExtractor() {
    registerUserExtractor((req: ExpressRequest & { user: any }) => req.user);
}

let middleware: ExpressHandler[] = [];
/**
 * @param m A middleware to be used on all API endpoints
 */
export function registerMiddleware(m: ExpressHandler) {
    middleware.push(m);
}

/**
 * Call register with each API endpoint to register a function to handle the request.
 * @param app the express app
 * @param api the instance of API that represents the endpoint
 * @param handler the function that gives a Response given a Request
 * @param middlewares optional Express middleware to be added
 */
export function register<Req extends object, Res extends (object | null), User>(
    app: Express, api: API<Req, Res>, handler: Handler<Req, Res>, ...middlewares: ExpressHandler[]) {
    return app.post(api.path, ...middleware, ...middlewares, wrap(api, handler, userExtractor as UserExtractor<User>));
}
