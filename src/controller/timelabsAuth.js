import crypto from "crypto";
import jwt from "jsonwebtoken";
import { jwtVerify, compactDecrypt } from "jose";
import { TextDecoder, TextEncoder } from "util";

import { StatusCodes } from "http-status-codes";
import { AsyncHandler } from "../utils/asyncHandler.js";
import { BadRequestError } from "../utils/errorHandler.js";
import { config } from "../config.js";
import { createUserService, FindUserByEmail, FindUserByEmailOrUserId } from "../services/users.service.js";
import { cacheDel } from "../utils/redisCache.js";

function getCookieOptions(req) {
  const isHttps = req.protocol === "https" || req.get("x-forwarded-proto") === "https";

  return {
    httpOnly: true,
    secure: isHttps,
    maxAge: 12 * 60 * 60 * 1000,
    sameSite: "lax",
  };
}

function asUtf8Key(k) {
  if (!k || typeof k !== "string") return null;
  return new TextEncoder().encode(k.trim());
}

async function decodeTimeLabsToken(token) {
  if (!token || typeof token !== "string") return {};

  const authKey = asUtf8Key(config.TIMELABS_AUTH_KEY);
  const encKey = asUtf8Key(config.TIMELABS_ENCRYPTION_KEY);

  if (!authKey && !encKey) {
    throw new BadRequestError(
      "TimeLabs SSO keys missing on server",
      "decodeTimeLabsToken()"
    );
  }

  const tryDecodeJwt = async (input) => {
    try {
      const decoded = jwt.decode(input);
      if (decoded && typeof decoded === "object") return decoded;
    } catch {}

    try {
      if (authKey) {
        const { payload } = await jwtVerify(input, authKey);
        return payload;
      }
    } catch {}

    return null;
  };

  try {
    const parsed = JSON.parse(token);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {}

  if (authKey) {
    try {
      const { payload } = await jwtVerify(token, authKey);
      return payload;
    } catch {}
  }

  if (encKey) {
    try {
      const { plaintext } = await compactDecrypt(token, encKey);
      const text = new TextDecoder().decode(plaintext);

      const parsedPlaintext = (() => {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      })();

      if (parsedPlaintext && typeof parsedPlaintext === "object") return parsedPlaintext;

      const jwtPayload = await tryDecodeJwt(text);
      if (jwtPayload) return jwtPayload;
    } catch {}
  }

  const fallback = await tryDecodeJwt(token);
  if (fallback) return fallback;

  return jwt.decode(token) || {};
}

function pickFirst(obj, keys) {
  const queue = [obj];

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;

    for (const key of keys) {
      const value = current[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }

  return null;
}

function randomPassword() {
  return crypto.randomBytes(24).toString("base64url");
}

export const TimeLabsLogin = AsyncHandler(async (req, res) => {
  const { token } = req.body || {};
  if (!token || typeof token !== "string") {
    throw new BadRequestError("token is required", "TimeLabsLogin()");
  }

  const payload = await decodeTimeLabsToken(token);

  const email =
    pickFirst(payload, [
      "email",
      "user_email",
      "mail",
      "Email",
      "EmailId",
      "emailId",
      "userEmail",
    ]) || null;

  const userId =
    pickFirst(payload, [
      "user_id",
      "employee_id",
      "emp_id",
      "empId",
      "EmployeeId",
      "employeeCode",
      "userName",
    ]) || null;

  const fullName =
    pickFirst(payload, [
      "full_name",
      "employeeName",
      "name",
      "user_name",
      "username",
    ]) || (email ? email.split("@")[0] : "TimeLabs User");

  const desigination = pickFirst(payload, [
    "desigination",
    "designation",
    "designationName",
    "role_name",
    "title",
  ]);

  let user = null;

  if (email) {
    user = await FindUserByEmail(email.toLowerCase());
  }

  if (!user && userId) {
    user = await FindUserByEmailOrUserId(String(userId));
  }

  if (!user) {
    const fallbackEmail = email || `${String(userId || fullName).replace(/\s+/g, "").toLowerCase()}@timelabs.local`;

    user = await createUserService({
      email: fallbackEmail,
      full_name: fullName,
      user_id: userId || null,
      desigination: desigination || null,
      password: randomPassword(),
    });
  } else {
    const updatePayload = {};
    if (fullName && user.full_name !== fullName) updatePayload.full_name = fullName;
    if (desigination && user.desigination !== desigination) {
      updatePayload.desigination = desigination;
    }
    if (userId && !user.user_id) updatePayload.user_id = String(userId);

    const isTerminated =
      user?.terminate === true || user?.terminate === 1 || user?.terminate === "1";

    // Reactivate users coming from trusted TimeLabs SSO.
    if (isTerminated) {
      updatePayload.terminate = false;
    }

    if (Object.keys(updatePayload).length) {
      await user.update(updatePayload);
      user = await FindUserByEmailOrUserId(email || String(userId));
    }
  }

  const accessToken = jwt.sign(
    { email: user.email, id: user._id },
    config.JWT_SECRET,
    { expiresIn: "30days" }
  );
  const refreshToken = jwt.sign(
    { email: user.email, id: user._id },
    config.JWT_SECRET,
    { expiresIn: "31days" }
  );

  const cookieOptions = getCookieOptions(req);

  res
    .cookie("AT", accessToken, cookieOptions)
    .cookie("RT", refreshToken, cookieOptions);

  await user.update({ refresh_token: refreshToken });
  await cacheDel(`user:profile:${user._id}`);

  res.status(StatusCodes.OK).json({
    message: "User login Successfully",
    user: {
      id: user._id,
      email: user.email,
      user_id: user.user_id,
      full_name: user.full_name,
    },
  });
});