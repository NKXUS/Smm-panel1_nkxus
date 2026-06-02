<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\SupportTicket;

class SupportTicketController extends Controller
{
     public function createSupportTicket(Request $request)
    {
        try {

            $ticket = SupportTicket::create([
                'user_id'   => $request->user_id,
                'order_id'  => $request->order_id,
                'subject'   => $request->subject,
                'message'   => $request->message,
                'email'     => $request->email,
                'full_name' => $request->full_name,
                'status'    => $request->status,
            ]);

            return response()->json([
                'status' => true,
                'message' => 'Support ticket created successfully',
                'data' => $ticket
            ], 201);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to create support ticket',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    // GET SUPPORT TICKETS
    public function getSupportTickets()
    {
        try {

            $tickets = SupportTicket::with(['user', 'order'])
                ->latest()
                ->paginate(10);

            return response()->json([
                'status' => true,
                'message' => 'Support tickets fetched successfully',
                'data' => $tickets
            ], 200);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to fetch support tickets',
                'error' => $e->getMessage()
            ], 500);
        }
    }
    public function updateSupportTicketStatus(Request $request)
    {
        try {
            $request->validate([
                'ticket_id' => 'required_without:id|integer|exists:support_tickets,id',
                'id' => 'required_without:ticket_id|integer|exists:support_tickets,id',
                'status' => 'required|in:open,pending,closed',
            ]);

            $ticketId = $request->ticket_id ?? $request->id;
            $ticket = SupportTicket::with(['user', 'order'])->findOrFail($ticketId);
            $ticket->update(['status' => $request->status]);

            return response()->json([
                'status' => true,
                'message' => 'Support ticket status updated successfully',
                'data' => $ticket->fresh(['user', 'order']),
            ], 200);

        } catch (\Throwable $e) {
            $code = method_exists($e, 'getStatusCode') ? $e->getStatusCode() : 500;

            return response()->json([
                'status' => false,
                'message' => $e->getMessage() ?: 'Failed to update support ticket status',
            ], $code);
        }
    }
}