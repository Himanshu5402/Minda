import { Router } from 'express'

// ------------------  local imports -------------------
import { Authorization } from './middleware/Authorization.js'
import companyRoutes from './routes/company.routes.js'
import plantRoutes from './routes/plant.routes.js'
import roleRoutes from './routes/role.routes.js'
import usersRoutes from './routes/users.routes.js'
import processRoutes from './routes/process.routes.js'
import AssemblyRoutes from './routes/assembly.routes.js'
import PartRoutes from './routes/parts.routes.js'
import CheckItemRoutes from './routes/checklist.routes.js'
import CheckListHistoryRoutes from './routes/checkListHostory.routes.js'
import DashboardRoutes from './routes/dashboards.routes.js'
import TypesRoutes from './routes/types.routes.js'
import NotificationRoutes from './routes/notification.routes.js'
import departmentRoutes from './routes/department.routes.js'
import ReleaseGroupRoutes from './routes/releasingGroup.route.js'
import documentsRoutes from './routes/documents.routes.js'
import TemplateMasterRoutes from './routes/templateMaster.routes.js'
import WorkflowRoutes from './routes/workflow.routes.js'
import TemplateSubmissionRoutes from './routes/templateSubmission.routes.js'
import PlcDataRoutes from './routes/plcData.routes.js'
import { createPlcData } from './controller/plcData.controller.js'
import PlcProductRoutes from './routes/plcProduct.routes.js'
import QualityCheckRoutes from './routes/qualityCheck.routes.js'
import PlcDashboardRoutes from './routes/plcDashboard.routes.js'
import MachineHistoryRoutes from './routes/machineHistory.routes.js'
import StatusHistourRoutes from './routes/statusHistory.routes.js'
import EmailRoutes from './routes/email.routes.js'
import ProductionLogsRoutes from './routes/productionLogs.routes.js'

const routes = Router()

routes.use('/users', usersRoutes)
routes.use('/company', Authorization, companyRoutes)
routes.use('/plant', Authorization, plantRoutes)
routes.use('/roles', Authorization, roleRoutes)
routes.use('/process', Authorization, processRoutes)
routes.use('/assembly', Authorization, AssemblyRoutes)
routes.use('/parts', Authorization, PartRoutes)
routes.use('/checkitem', Authorization, CheckItemRoutes)
routes.use('/checkitem-history', Authorization, CheckListHistoryRoutes)
routes.use('/dashboard', Authorization, DashboardRoutes)
routes.use('/types', Authorization, TypesRoutes)
routes.use('/notification', Authorization, NotificationRoutes)
routes.use('/department', Authorization, departmentRoutes)
routes.use('/document', Authorization, documentsRoutes)
routes.use('/release-group', Authorization, ReleaseGroupRoutes)
routes.use('/template-master', Authorization, TemplateMasterRoutes)
routes.use('/workflow', Authorization, WorkflowRoutes)
routes.use('/template-submission', Authorization, TemplateSubmissionRoutes)
routes.get('/plc-data/ping', (_req, res) =>
  res.status(200).json({ message: 'plc-data route reachable' }),
)
routes.post('/plc-data', createPlcData) // PLC machines push data - no auth required
routes.use('/plc-data', PlcDataRoutes)
routes.use('/plc-dashboard', Authorization, PlcDashboardRoutes)
routes.use('/machine-history', Authorization, MachineHistoryRoutes)
routes.use('/plc-products', Authorization, PlcProductRoutes)
routes.use('/quality-check', Authorization, QualityCheckRoutes)
routes.use('/status-history', Authorization, StatusHistourRoutes)
routes.use('/email', Authorization, EmailRoutes)
routes.use('/production-logs', Authorization, ProductionLogsRoutes)

export default routes
