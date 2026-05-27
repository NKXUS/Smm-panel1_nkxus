<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Referral;
use App\Models\SmmUser;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrderController extends Controller
{
    public function createOrder(Request $request)
    {
        try {
            $user = SmmUser::find($request->user_id);

            if (!$user) {
                return response()->json([
                    'status' => false,
                    'message' => 'User not found'
                ], 404);
            }

            $charge = (float) ($request->charge ?? 0);
            $orderStatus = $request->status ?? 'completed';

            if (!in_array($orderStatus, ['pending', 'in_progress', 'completed', 'partial', 'cancelled'])) {
                return response()->json([
                    'status' => false,
                    'message' => 'Invalid order status'
                ], 422);
            }

            if ($orderStatus === 'completed' && $charge > (float) $user->balance) {
                return response()->json([
                    'status' => false,
                    'message' => 'Insufficient balance'
                ], 422);
            }

            $commission = 0;

            $order = DB::transaction(function () use ($request, $user, $charge, $orderStatus, &$commission) {
                $order = Order::create([
                    'user_id' => $request->user_id,
                    'service_id' => $request->service_id,
                    'link' => $request->link,
                    'quantity' => $request->quantity,
                    'charge' => $charge,
                    'start_count' => $request->start_count ?? 0,
                    'remains' => $request->remains ?? 0,
                    'status' => $orderStatus,
                ]);

                if ($orderStatus === 'completed' && $charge > 0) {
                    $user->decrement('balance', $charge);
                    $user->refresh();
                    $commission = $this->applyReferralCommission($user, $charge, 1);
                }

                return $order;
            });

            return response()->json([
                'status' => true,
                'message' => 'Order created successfully',
                'data' => $order,
                'referral_commission' => $commission,
                'user' => [
                    'id' => $user->id,
                    'username' => $user->username,
                    'email' => $user->email,
                    'balance' => $user->balance,
                ]
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Failed to create order',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function getOrders()
    {
        try {
            $pendingOrder = Order::where('status', 'pending')
                ->latest()
                ->paginate(10);

            $inProgressOrder = Order::where('status', 'in_progress')
                ->latest()
                ->paginate(10);

            $completedOrder = Order::where('status', 'completed')
                ->latest()
                ->paginate(10);

            $partialOrder = Order::where('status', 'partial')
                ->latest()
                ->paginate(10);

            $cancelledOrder = Order::where('status', 'cancelled')
                ->latest()
                ->paginate(10);

            $orders = Order::with(['user', 'service'])
                ->latest()
                ->paginate(10);

            return response()->json([
                'status' => true,
                'message' => 'Orders fetched successfully',
                'data' => $orders,
                'pendingorders' => $pendingOrder,
                'inprogressorder' => $inProgressOrder,
                'completedorder' => $completedOrder,
                'partialorder' => $partialOrder,
                'cancelledorder' => $cancelledOrder,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Failed to fetch orders',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function updateOrderStatus(Request $request)
    {
        try {
            $request->validate([
                'order_id' => 'required_without:id|integer|exists:orders,id',
                'id' => 'required_without:order_id|integer|exists:orders,id',
                'status' => 'required|in:pending,in_progress,completed,partial,cancelled',
            ]);

            $orderId = $request->order_id ?? $request->id;
            $commission = 0;

            $order = DB::transaction(function () use ($request, $orderId, &$commission) {
                $order = Order::lockForUpdate()->findOrFail($orderId);
                $oldStatus = $order->status;
                $newStatus = $request->status;
                $charge = (float) $order->charge;

                if ($oldStatus !== $newStatus && $charge > 0) {
                    $user = SmmUser::lockForUpdate()->find($order->user_id);

                    if (!$user) {
                        abort(404, 'User not found');
                    }

                    if ($oldStatus !== 'completed' && $newStatus === 'completed') {
                        if ($charge > (float) $user->balance) {
                            abort(422, 'Insufficient balance');
                        }

                        $user->decrement('balance', $charge);
                        $commission = $this->applyReferralCommission($user, $charge, 1);
                    }

                    if ($oldStatus === 'completed' && $newStatus !== 'completed') {
                        $user->increment('balance', $charge);
                        $commission = $this->applyReferralCommission($user, $charge, -1);
                    }
                }

                $order->update(['status' => $newStatus]);

                return $order->fresh(['user', 'service']);
            });

            return response()->json([
                'status' => true,
                'message' => 'Order status updated successfully',
                'data' => $order,
                'referral_commission' => $commission,
            ], 200);

        } catch (\Throwable $e) {
            $code = method_exists($e, 'getStatusCode') ? $e->getStatusCode() : 500;

            return response()->json([
                'status' => false,
                'message' => $e->getMessage() ?: 'Failed to update order status',
            ], $code);
        }
    }

    private function getReferralLink(int $referrerId): string
    {
        $frontendUrl = rtrim(env('FRONTEND_URL', config('app.url')), '/');

        return $frontendUrl . '/signup.html?ref=' . $referrerId;
    }

    private function applyReferralCommission(SmmUser $user, float $amount, int $direction): float
    {
        if (!$user->referrer_id || $amount <= 0) {
            return 0;
        }

        $referral = Referral::firstOrCreate(
            ['referrer_id' => $user->referrer_id],
            [
                'referral_link' => $this->getReferralLink($user->referrer_id),
                'commission_rate' => 3,
                'total_earnings' => 0,
                'available_earnings' => 0,
                'min_payout' => 10,
                'conversion_rate' => 0,
            ]
        );

        $referralLink = $this->getReferralLink($user->referrer_id);

        if ($referral->referral_link !== $referralLink) {
            $referral->update([
                'referral_link' => $referralLink,
            ]);
        }

        $commission = round(($amount * (float) $referral->commission_rate) / 100, 2);

        if ($commission <= 0) {
            return 0;
        }

        $totalEarnings = max(0, (float) $referral->total_earnings + ($commission * $direction));
        $availableEarnings = max(0, (float) $referral->available_earnings + ($commission * $direction));

        $referral->update([
            'total_earnings' => $totalEarnings,
            'available_earnings' => $availableEarnings,
        ]);

        return $commission * $direction;
    }
}
