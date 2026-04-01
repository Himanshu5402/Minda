import { AsyncHandler } from "../utils/asyncHandler.js";
import { StatusCodes } from "http-status-codes";
import { 
  getMachineHistoryService, 
  getMachineSummaryService, 
  getMachineLatestStatusService 
} from "../services/machineHistory.service.js";

export const getMachineHistory = AsyncHandler(async (req, res) => {
  const { device_id, status, model, duration, startDate, endDate, page, limit } = req.query;

  if (!device_id) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "device_id is required" });
  }

  const result = await getMachineHistoryService(
    { device_id, status, model, duration, startDate, endDate },
    { page, limit }
  );

  res.status(StatusCodes.OK).json({
    message: "Machine history fetched successfully",
    data: result,
  });
});

export const getMachineSummary = AsyncHandler(async (req, res) => {
  const { device_id, status, model, duration, startDate, endDate } = req.query;
  
  if (!device_id) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "device_id is required" });
  }

  const result = await getMachineSummaryService({ device_id, status, model, duration, startDate, endDate });

  res.status(StatusCodes.OK).json({
    message: "Machine summary fetched successfully",
    data: result,
  });
});

export const getMachineLatestStatus = AsyncHandler(async (req, res) => {
  const { device_id } = req.query;
  
  if (!device_id) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: "device_id is required" });
  }

  const result = await getMachineLatestStatusService(device_id);

  res.status(StatusCodes.OK).json({
    message: "Machine latest status fetched successfully",
    data: result,
  });
});
