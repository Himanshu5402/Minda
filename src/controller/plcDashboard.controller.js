import { AsyncHandler } from "../utils/asyncHandler.js";
import { StatusCodes } from "http-status-codes";
import { getAllPlcDashboardService, getPlcDashboardOptionsService } from "../services/plcDashboard.service.js";

/**
 * Controller to fetch the latest state of all machines from the plc_dashboard table.
 * GET /plc-dashboard
 */
export const getPlcDashboard = AsyncHandler(async (req, res) => {
  const {
    device_id,
    status,
    company_name,
    plant_name,
    page = 1,
    limit = 6,
  } = req.query;

  const filters = {
    device_id,
    status,
    company_name,
    plant_name,
  };

  const result = await getAllPlcDashboardService(filters, {
    page: Number(page) || 1,
    limit: Number(limit) || 6,
  });

  res.status(StatusCodes.OK).json({
    message: "PLC Dashboard data fetched successfully",
    data: result?.rows || result || [],
    pagination: result?.pagination || {
      page: Number(page) || 1,
      limit: Number(limit) || 6,
      totalPages: 1,
      totalItems: result?.rows?.length || 0,
    },
  });
});

/**
 * Controller to fetch the filter options for the dashboard.
 * GET /plc-dashboard/options
 */
export const getPlcDashboardOptions = AsyncHandler(async (req, res) => {
  const options = await getPlcDashboardOptionsService();
  res.status(StatusCodes.OK).json({
    message: "Dashboard filter options fetched successfully",
    data: options,
  });
});
