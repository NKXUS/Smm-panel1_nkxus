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
}
