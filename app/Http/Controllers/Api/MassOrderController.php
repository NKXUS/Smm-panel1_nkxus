<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\MassOrder;

class MassOrderController extends Controller
{
       public function createMassOrder(Request $request)
    {
        try {

            $massOrder = MassOrder::create([
                'user_id'   => $request->user_id,
                'raw_input' => $request->raw_input,
                'status'    => 'pending',
            ]);

            return response()->json([
                'status' => true,
                'message' => 'Mass order created successfully',
                'data' => $massOrder
            ], 201);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to create mass order',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    // GET MASS ORDERS
    public function getMassOrders()
    {
        try {

            $massOrders = MassOrder::with('user')
                ->latest()
                ->paginate(10);

            return response()->json([
                'status' => true,
                'message' => 'Mass orders fetched successfully',
                'data' => $massOrders
            ], 200);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to fetch mass orders',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function updateMassOrderStatus(Request $request)
    {
        try {
            $request->validate([
                'mass_order_id' => 'required_without:id|integer|exists:mass_orders,id',
                'id' => 'required_without:mass_order_id|integer|exists:mass_orders,id',
                'status' => 'required|in:partial,pending,processing,completed',
            ]);

            $massOrderId = $request->mass_order_id ?? $request->id;
            $massOrder = MassOrder::findOrFail($massOrderId);

            $massOrder->update([
                'status' => $request->status,
            ]);

            return response()->json([
                'status' => true,
                'message' => 'Mass order status updated successfully',
                'data' => $massOrder->fresh('user'),
            ], 200);

        } catch (\Throwable $e) {
            $code = method_exists($e, 'getStatusCode') ? $e->getStatusCode() : 500;

            return response()->json([
                'status' => false,
                'message' => $e->getMessage() ?: 'Failed to update mass order status',
            ], $code);
        }
    }
}
