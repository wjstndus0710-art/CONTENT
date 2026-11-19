import { maintenanceResponse } from "../maintenance.mjs";

export default (request, context) =>
  maintenanceResponse(request) ?? context.next();
