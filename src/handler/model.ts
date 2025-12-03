import { MachineStateDocument } from "../database/schema"


export enum HttpMethod {
    GET = 'GET',
    POST = 'POST',
    PUT = 'PUT',
    DELETE = 'DELETE',
};


export enum HttpResponseCode {
    OK = 200,
    CREATED = 201,
    BAD_REQUEST = 400,
    UNAUTHORIZED = 401,
    NOT_FOUND = 404,
    HARDWARE_ERROR = 420,
    INTERNAL_SERVER_ERROR = 500,
}


export interface RequestModel {
    method: HttpMethod,
    path: string,
    token: string
}


export interface RequestMachineRequestModel extends RequestModel {
    locationId: string, 
    jobId: string
}


export interface GetMachineRequestModel extends RequestModel {
    machineId: string
}


export interface StartMachineRequestModel extends RequestModel {
    machineId: string
}


export interface MachineResponseModel {
    statusCode: HttpResponseCode,
    machine: MachineStateDocument | null
}
