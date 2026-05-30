import { StatusCodes } from "http-status-codes";
import { AsyncHandler } from "../utils/asyncHandler.js";
import { BadRequestError } from "../utils/errorHandler.js";
import {
  getProductionLogsForUser,
  getProductionLogsSummary,
} from "../services/productionLogs.service.js";

export const getMyProductionLogs = AsyncHandler(async (req, res) => {
  const employeeUserId = req.currentUser?.user_id;

  if (!employeeUserId) {
    throw new BadRequestError(
      "User employee id (user_id) is not set on profile",
      "getMyProductionLogs()"
    );
  }

  const { page, limit, status, search } = req.query;

  const result = await getProductionLogsForUser(employeeUserId, {
    page,
    limit,
    status,
    search,
  });

  res.status(StatusCodes.OK).json({ data: result });
});

export const getMyProductionLogsSummary = AsyncHandler(async (req, res) => {
  const employeeUserId = req.currentUser?.user_id;

  if (!employeeUserId) {
    throw new BadRequestError(
      "User employee id (user_id) is not set on profile",
      "getMyProductionLogsSummary()"
    );
  }

  const summary = await getProductionLogsSummary(employeeUserId);

  res.status(StatusCodes.OK).json({ data: summary });
});
