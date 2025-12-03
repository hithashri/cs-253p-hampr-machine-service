import { DataCache } from "../database/cache";
import { MachineStateTable } from "../database/table";
import { IdentityProviderClient } from "../external/idp";
import { SmartMachineClient } from "../external/smart-machine";
import {
  GetMachineRequestModel,
  HttpResponseCode,
  MachineResponseModel,
  RequestMachineRequestModel,
  RequestModel,
  StartMachineRequestModel,
} from "./model";
import { MachineStateDocument, MachineStatus } from "../database/schema";


export class ApiHandler {
  private cache: DataCache<MachineStateDocument>;

  constructor() {
    this.cache = DataCache.getInstance<MachineStateDocument>();
  }


  private checkToken(token: string) {
    const idp = IdentityProviderClient.getInstance();
    const valid = idp.validateToken(token);

    if (!valid) {
      throw JSON.stringify({
        statusCode: HttpResponseCode.UNAUTHORIZED,
        message: "Invalid token",
      });
    }
  }

  private handleRequestMachine(
    request: RequestMachineRequestModel
  ): MachineResponseModel {
    const table = MachineStateTable.getInstance();

    const available = table.listMachinesAtLocation(request.locationId);
    if (!available || available.length === 0) {
      return { statusCode: HttpResponseCode.NOT_FOUND, machine: null };
    }

    const chosen = available[0];

    table.updateMachineStatus(chosen.machineId, MachineStatus.AWAITING_DROPOFF);
    table.updateMachineJobId(chosen.machineId, request.jobId);

    const updated = table.getMachine(chosen.machineId);
    if (!updated) {
      return { statusCode: HttpResponseCode.INTERNAL_SERVER_ERROR, machine: null };
    }

    
    this.cache.put(updated.machineId, updated);

    return {
      statusCode: HttpResponseCode.OK,
      machine: updated,
    };
  }

  
  private handleGetMachine(request: GetMachineRequestModel): MachineResponseModel {
    const table = MachineStateTable.getInstance();

    let machine = this.cache.get(request.machineId);
    if (machine) {
      return { statusCode: HttpResponseCode.OK, machine };
    }

    machine = table.getMachine(request.machineId);
    if (!machine) {
      return { statusCode: HttpResponseCode.NOT_FOUND, machine: null };
    }

    this.cache.put(machine.machineId, machine);
    return { statusCode: HttpResponseCode.OK, machine };
  }

  
  private handleStartMachine(
    request: StartMachineRequestModel
  ): MachineResponseModel {
    const table = MachineStateTable.getInstance();
    const smClient = SmartMachineClient.getInstance();

    const machine = table.getMachine(request.machineId);
    if (!machine) {
      return { statusCode: HttpResponseCode.NOT_FOUND, machine: null };
    }

    if (machine.status !== MachineStatus.AWAITING_DROPOFF) {
      return { statusCode: HttpResponseCode.BAD_REQUEST, machine };
    }

    try {
      smClient.startCycle(request.machineId);
    } catch (err) {
      // On hardware error, mark machine ERROR and return HARDWARE_ERROR with new state
      table.updateMachineStatus(request.machineId, MachineStatus.ERROR);
      const errorMachine = table.getMachine(request.machineId) || null;
      if (errorMachine) {
        this.cache.put(request.machineId, errorMachine);
      }
      return { statusCode: HttpResponseCode.HARDWARE_ERROR, machine: errorMachine };
    }

    
    table.updateMachineStatus(request.machineId, MachineStatus.RUNNING);
    const updated = table.getMachine(request.machineId);
    if (!updated) {
      return { statusCode: HttpResponseCode.INTERNAL_SERVER_ERROR, machine: null };
    }
    this.cache.put(request.machineId, updated);

    return { statusCode: HttpResponseCode.OK, machine: updated };
  }

  
  public handle(request: RequestModel) {
    this.checkToken(request.token);

    if (request.method === "POST" && request.path === "/machine/request") {
      return this.handleRequestMachine(request as RequestMachineRequestModel);
    }

    const getMachineMatch = request.path.match(/^\/machine\/([a-zA-Z0-9-]+)$/);
    if (request.method === "GET" && getMachineMatch) {
      const machineId = getMachineMatch[1];
      const getRequest = { ...request, machineId } as GetMachineRequestModel;
      return this.handleGetMachine(getRequest);
    }

    const startMachineMatch = request.path.match(
      /^\/machine\/([a-zA-Z0-9-]+)\/start$/
    );
    if (request.method === "POST" && startMachineMatch) {
      const machineId = startMachineMatch[1];
      const startRequest = { ...request, machineId } as StartMachineRequestModel;
      return this.handleStartMachine(startRequest);
    }

    return { statusCode: HttpResponseCode.INTERNAL_SERVER_ERROR, machine: null };
  }
}
