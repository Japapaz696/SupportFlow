import { Router } from 'express';

import {
  getTicketTechnicalDiagnosticController,
  saveTicketTechnicalDiagnosticController,
} from '../controllers/ticket-technical-diagnostics.controller.js';
import {
  addCommentController,
  assignTicketController,
  changePriorityController,
  changeStatusController,
  createTicketController,
  getTicketController,
  listTicketsController,
} from '../controllers/tickets.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const ticketsRouter = Router();

ticketsRouter.use(requireAuth);
ticketsRouter.get('/', listTicketsController);
ticketsRouter.post('/', createTicketController);
ticketsRouter.get('/:id', getTicketController);
ticketsRouter.get('/:id/technical-diagnostic', getTicketTechnicalDiagnosticController);
ticketsRouter.put('/:id/technical-diagnostic', saveTicketTechnicalDiagnosticController);
ticketsRouter.patch('/:id/assignee', assignTicketController);
ticketsRouter.patch('/:id/status', changeStatusController);
ticketsRouter.patch('/:id/priority', changePriorityController);
ticketsRouter.post('/:id/comments', addCommentController);
