<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use Illuminate\Http\Request;

class OrderController extends Controller
{
     public function createOrder(Request $request)
    {
        try {

            $order = Order::create([
                'user_id' => $request->user_id,
                'service_id' => $request->service_id,
                'link' => $request->link,
                'quantity' => $request->quantity,
                'charge' => $request->charge,
                'start_count' => $request->start_count ?? 0,
                'remains' => $request->remains ?? 0,
                'status' => $request->status ?? 'pending',
            ]);

            return response()->json([
                'status' => true,
                'message' => 'Order created successfully',
                'data' => $order
            ], 201);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to create order',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    // GET ORDERS WITH PAGINATION
    public function getOrders()
    {
        try {
          $pendingOrder = Order::where('status','pending')
            ->latest()
            ->paginate(10);
             $in_progressOrder = Order::where('status','in_progress')
            ->latest()
            ->paginate(10);
             $completedOrder = Order::where('status','completed')
            ->latest()
            ->paginate(10);

             $partialOrder = Order::where('status','partial')
            ->latest()
            ->paginate(10);
            $cancelledOrder = Order::where('status','cancelled')
            ->latest()
            ->paginate(10);
            
            $orders = Order::with(['user', 'service'])   
                ->latest()
                ->paginate(10);

            return response()->json([
                'status' => true,
                'message' => 'Orders fetched successfully',
                'data' => $orders,
                'pendingorders'=>$pendingOrder,
                'inprogressorder'=>$in_progressOrder,
                'completedorder'=>$completedOrder,
                'partialorder'=>$partialOrder,
                'cancelledorder'=>$cancelledOrder,
            ], 200);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to fetch orders',
                'error' => $e->getMessage()
            ], 500);
        }
    }

}
