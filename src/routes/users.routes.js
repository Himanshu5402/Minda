import { Router } from 'express'

// ---------------------- local imports --------------------------
import {
  GetAllEmployees,
  GetAllemployees,
  GetAllHodData,
  getAssignedTemplates,
  getUserWithHod,
  getWithoutHod,
  LogedInUser,
  LoginUser,
  LogoutUser,
  RefreshToken,
  registerUser,
  RenderResetPasswordpage,
  Resetpassword,
  SearchEmployees,
  UpdateUser,
  verifyEmail,
} from '../controller/user.controller.js'
import { TimeLabsLogin } from '../controller/timelabsAuth.js'
import { Validater } from '../middleware/validator.js'
import { userValidationSchema } from '../validation/users.validation.js'
import { Authorization } from '../middleware/Authorization.js'

const routes = Router()

routes.route('/register-user').post(Validater(userValidationSchema), registerUser)
routes.route('/login-user').post(LoginUser)
routes.route('/timelabs-login').post(TimeLabsLogin)
routes.route('/logout-user').get(Authorization, LogoutUser)
routes.route('/loged-in-user').get(Authorization, LogedInUser)
routes.route('/update-user-by-admin/:id').put(Authorization, UpdateUser)
routes.route('/refresh-token').post(RefreshToken)
routes.route('/get-employees').get(Authorization, GetAllemployees)
routes.route('/search-employee').get(Authorization, SearchEmployees)
routes.route('/verify-email').post(verifyEmail)
routes.route('/reset-page').get(RenderResetPasswordpage)
routes.route('/reset-password').post(Resetpassword)
routes.route('/get-all-employees').get(Authorization, GetAllEmployees)
routes.route('/get-all-hods').get(Authorization, GetAllHodData)
routes.route('/get-with-hods-users').get(Authorization, getWithoutHod)
routes.route('/get-user-by-hod').get(Authorization, getUserWithHod)

routes.route('/get-assign-template').get(Authorization, getAssignedTemplates)

export default routes
