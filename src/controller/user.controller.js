import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";
import path from "path";

// ---------------------------- local imports  -------------------------
import { AsyncHandler } from "../utils/asyncHandler.js";
import { createUserService, FindUserByEmail, FindUserByEmailOrUserId, FindUserById, getAllHodsServicesData, getAllReleseGroupUsers, GetAllUsersService, getEmployeesOnlyHaveHod, GetTemplateAssignModuleServiceByUser, GetUsersService, SearchUsersService, UpdateUsersService } from "../services/users.service.js";
import { BadRequestError, NotFoundError } from "../utils/errorHandler.js";
import { StatusCodes } from "http-status-codes";
import { config } from "../config.js";
import { UserModel } from "../models/user.modal.js";
import { SendMail } from "../helper/SendEmail.js";



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export const registerUser = AsyncHandler(async (req, res) => {
    const data = req.body;
    const exist = await FindUserByEmailOrUserId(data.email);
    if (exist) {
        throw new BadRequestError("User already Register with the email or User id", "registerUser() method error")
    }


    const result = await createUserService(data);
    res.status(StatusCodes.CREATED).json({
        message: "User register successfully",
        user: result
    });
});

export const LoginUser = AsyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await FindUserByEmailOrUserId(email);

    if (!user) {
        throw new NotFoundError("Invalid credentials", "LoginUser() method error 1")
    }
    if (user.terminate) {
        throw new NotFoundError("User Terminated by Admin Please Contact to organization", "LoginUser() method error")
    }

    const isCorrect = await bcrypt.compare(password, user.password);

    if (!isCorrect) {
        throw new NotFoundError("Invalid credentials", "LoginUser() method error 2")
    }

    const accessToken = jwt.sign({ email: user.email, id: user._id }, config.JWT_SECRET, { expiresIn: "30days" })
    const refreshToken = jwt.sign({ email: user.email, id: user._id }, config.JWT_SECRET, { expiresIn: "31days" })

    res.cookie("AT", accessToken, {
        httpOnly: true,        // Cookie not accessible via document.cookie
        secure: config.NODE_ENV !== "development",          // Sent only over HTTPS
        maxAge: 12 * 60 * 60 * 1000, // Lifetime in milliseconds
        sameSite: "strict",    // "strict" | "lax" | "none"
    }).cookie("RT", refreshToken, {
        httpOnly: true,        // Cookie not accessible via document.cookie
        secure: config.NODE_ENV !== "development",          // Sent only over HTTPS
        maxAge: 12 * 60 * 60 * 1000, // Lifetime in milliseconds
        sameSite: "strict",    // "strict" | "lax" | "none"
    });

    res.status(StatusCodes.OK).json({
        message: "User login Successfully"
    });

    await user.update({ refresh_token: refreshToken })

});

export const LogoutUser = AsyncHandler(async (req, res) => {
    const user = req.currentUser;
    if (!user) {
        throw new NotFoundError("user is not authorized", "LogoutUser() method error");
    };
    res.clearCookie("AT").clearCookie("RT");
    res.status(StatusCodes.OK).json({
        message: "Logout Successfully"
    })
});

export const LogedInUser = AsyncHandler(async (req, res) => {
    res.status(StatusCodes.OK).json({
        user: req?.currentUser
    })
});

export const UpdateUser = AsyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    const result = await UpdateUsersService(id, data);
    if (!result) {
        throw new NotFoundError("User not found ", "UpdateUser() method error");
    };

    res.status(StatusCodes.OK).json({
        message: "User updated successfully",
        user: result
    })
});

export const RefreshToken = AsyncHandler(async (req, res) => {
    const token = req?.cookies?.AT || req?.headers?.authorization?.split(" ")[1];

    if (!token) {
        throw new NotFoundError("Token is required field", "RefreshToken() method error")
    };
    const payload = jwt.verify(token, config.JWT_SECRET);
    const user = await FindUserById(payload.id);

    if (!user) {
        throw new NotFoundError("Invalid user Please try again...", "RefreshToken() method error")
    }

    const accessToken = jwt.sign({ email: user.email, id: user._id }, config.JWT_SECRET, { expiresIn: "30days" })
    const refreshToken = jwt.sign({ email: user.email, id: user._id }, config.JWT_SECRET, { expiresIn: "31days" })

    res.cookie("AT", accessToken, {
        httpOnly: true,        // Cookie not accessible via document.cookie
        secure: config.NODE_ENV !== "development",          // Sent only over HTTPS
        maxAge: 12 * 60 * 60 * 1000, // Lifetime in milliseconds
        sameSite: "strict",    // "strict" | "lax" | "none"
    }).cookie("RT", refreshToken, {
        httpOnly: true,        // Cookie not accessible via document.cookie
        secure: config.NODE_ENV !== "development",          // Sent only over HTTPS
        maxAge: 12 * 60 * 60 * 1000, // Lifetime in milliseconds
        sameSite: "strict",    // "strict" | "lax" | "none"
    });

    res.status(StatusCodes.OK).json({
        message: "user logedin Successfully"
    });

    await UserModel.update({ refresh_token: refreshToken }, { where: { _id: user._id } })
});

export const GetAllemployees = AsyncHandler(async (req, res) => {
    let { limit, page } = req.query;
    limit = parseInt(limit) || 10;
    page = parseInt(page) || 1;
    const skip = (page - 1) * limit;
    const result = await GetUsersService(skip, limit);
    res.status(StatusCodes.OK).json({
        data: result
    });
});

export const SearchEmployees = AsyncHandler(async (req, res) => {
    let { is_hod, company, plant, search, limit, page } = req.query;
    limit = parseInt(limit) || 10;
    page = parseInt(page) || 1;
    const skip = (page - 1) * limit;
    const result = await SearchUsersService(is_hod, company, plant, search, skip, limit);
    res.status(StatusCodes.OK).json({
        data: result
    });

});

export const verifyEmail = AsyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        throw new NotFoundError("Email is required", "verifyEmail() method error");
    };

    const user = await FindUserByEmail(email);

    if (!user) {
        throw new NotFoundError("user is not found", "verifyEmail() method error");
    }

    const resetLink = config.NODE_ENV !== "development" ? config.SERVER_URL : config.LOCAL_SERVER_URL;
    const token = jwt.sign({ id: user._id }, config.JWT_SECRET, { expiresIn: "20min" })


    res.status(StatusCodes.OK).json({
        message: "email send successfully",
    });

    await SendMail("resetPassword", { name: user?.full_name || user?.email, resetLink: `${resetLink}/api/v1/users/reset-page?token=${token}`, appName: "JPM" }, { email: user.email, subject: "Reset Password" });

});

export const RenderResetPasswordpage = AsyncHandler(async (req, res) => {
    const { token } = req.query;

    if (!token) {
        throw new NotFoundError("Token is required field", "RenderResetPasswordpage() method error");
    };

    const payload = jwt.verify(token, config.JWT_SECRET);
    const user = await FindUserById(payload.id);


    if (!user) {
        throw new NotFoundError("User not exist please try again", "RenderResetPasswordpage() method error");
    }


    res.sendFile(path.join(__dirname, '../pages', 'reset-password-page.html'));


});

export const Resetpassword = AsyncHandler(async (req, res) => {
    const { token } = req.query;
    const { password } = req.body;

    if (!token || !password.trim()) {
        throw new BadRequestError("All fields are required");
    };

    const payload = jwt.verify(token, config.JWT_SECRET);
    const user = await FindUserById(payload.id);

    if (!user) {
        throw new NotFoundError("User not exist please try again", "RenderResetPasswordpage() method error");
    };

    await UpdateUsersService(user._id, { password });

    res.status(StatusCodes.OK).json({
        success: true,
        message: "password reset successfully",
        redirectUrl: config.NODE_ENV !== "development" ? config.CLIENT_URL : config.LOCAL_CLIENT_URL
    })


});


export const GetAllEmployees = AsyncHandler(async (req, res) => {
    const result = await GetAllUsersService();
    res.status(StatusCodes.OK).json({
        data: result
    })
});


export const GetAllHodData = AsyncHandler(async (req, res) => {
    const result = await getAllHodsServicesData();
    res.status(StatusCodes.OK).json({
        data: result,
        success: true
    })
});


export const getWithoutHod = AsyncHandler(async (req, res) => {
    const result = await getAllReleseGroupUsers();

    res.status(StatusCodes.OK).json({
        data: result
    })
})

export const getUserWithHod = AsyncHandler(async (req, res) => {
    const result = await getEmployeesOnlyHaveHod();

    res.status(StatusCodes.OK).json({
        data: result
    });
});


export const getAssignedTemplates = AsyncHandler(async (req, res) => {
    const user = req.currentUser;
    const result = await GetTemplateAssignModuleServiceByUser(user._id);

    res.status(StatusCodes.OK).json({
        data: result
    });
});


