import jwt from "jsonwebtoken";

import { AsyncHandler } from "../utils/asyncHandler.js";
import { NotFoundError, UnAuthorizedError } from "../utils/errorHandler.js";
import { FindUserById } from "../services/users.service.js";
import { config } from "../config.js";
import { serializeUser } from "../utils/userSerializer.js";

export const Authorization = AsyncHandler(async (req, res, next) => {
  const authHeader = req?.headers?.authorization || "";
  const token =
    req?.cookies?.AT ||
    (typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null);

  if (!token) {
    throw new UnAuthorizedError(
      "Invalid request. User not authorized.",
      "Authorization() method error"
    );
  }

  try {
    const payload = jwt.verify(token, config.JWT_SECRET);
    const user = await FindUserById(payload.id);

    if (!user) {
      throw new NotFoundError(
        "User does not exist in database",
        "Authorization() method error"
      );
    }

    const isTerminated = user?.terminate === true || user?.terminate === 1 || user?.terminate === "1";

    if (isTerminated) {
      throw new NotFoundError(
        "User terminated by admin. Please contact the organization.",
        "Authorization() method error"
      );
    }

    req.currentUser = serializeUser(user);
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      throw new UnAuthorizedError(
        "Session expired or token invalid",
        "Authorization() method error"
      );
    }

    throw error;
  }
});
