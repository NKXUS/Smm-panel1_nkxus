<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Payout;
use App\Models\Referral;
use App\Models\SmmUser;
use Illuminate\Http\Request;

class PayoutController extends Controller
{
    public function createPayout(Request $request)
    {
        try {

            $request->validate([
                'user_id' => 'required|exists:smmusers,id',
                'amount' => 'required|numeric|min:1',
                'status' => 'nullable|in:pending,paid,success',
                'payout_date' => 'nullable|date',
            ]);

            $status = $request->status ?? 'pending';

            $referral = Referral::where('referrer_id', $request->user_id)->first();

            if (!$referral) {
                return response()->json([
                    'status' => false,
                    'message' => 'Referral account not found'
                ], 404);
            }

            if ((float) $request->amount < (float) $referral->min_payout) {
                return response()->json([
                    'status' => false,
                    'message' => 'Amount is less than minimum payout'
                ], 400);
            }

            if ((float) $request->amount > (float) $referral->available_earnings) {
                return response()->json([
                    'status' => false,
                    'message' => 'Insufficient available earnings'
                ], 400);
            }

            $payout = Payout::create([
                'referral_id' => $referral->id,
                'amount' => $request->amount,
                'status' => $status,
                'payout_date' => in_array($status, ['paid', 'success'])
                    ? ($request->payout_date ?? now()->toDateString())
                    : null,
            ]);

            $referral->decrement('available_earnings', $request->amount);

            $user = SmmUser::find($request->user_id);
            if (in_array($status, ['paid', 'success']) && $user) {
                $user->increment('balance', $request->amount);
                $user = $user->fresh();
            }

            return response()->json([
                'status' => true,
                'message' => 'Payout request created successfully',
                'data' => $payout->fresh('referral'),
                'user' => $user,
            ], 201);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to create payout request',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function getPayouts(Request $request)
    {
        try {

            $user = $this->getUserFromRequest($request);

            if (!$user) {
                return response()->json([
                    'status' => false,
                    'message' => 'User not found'
                ], 404);
            }

            $referral = Referral::where('referrer_id', $user->id)->first();

            if (!$referral) {
                return response()->json([
                    'status' => true,
                    'message' => 'Payouts fetched successfully',
                    'data' => []
                ], 200);
            }

            $payouts = Payout::where('referral_id', $referral->id)
                ->latest()
                ->paginate(10);

            return response()->json([
                'status' => true,
                'message' => 'Payouts fetched successfully',
                'available_earnings' => $referral->available_earnings,
                'minimum_payout' => $referral->min_payout,
                'data' => $payouts
            ], 200);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to fetch payouts',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function updatePayoutStatus(Request $request)
    {
        try {

            $request->validate([
                'payout_id' => 'required|exists:payouts,id',
                'status' => 'required|in:pending,approved,paid,success,rejected',
                'payout_date' => 'nullable|date',
            ]);

            $payout = Payout::find($request->payout_id);
            $oldStatus = $payout->status;

            $payout->update([
                'status' => $request->status,
                'payout_date' => in_array($request->status, ['paid', 'success'])
                    ? ($request->payout_date ?? now()->toDateString())
                    : null,
            ]);

            if ($request->status === 'rejected' && $oldStatus !== 'rejected') {
                $payout->referral->increment('available_earnings', $payout->amount);
            }

            return response()->json([
                'status' => true,
                'message' => 'Payout status updated successfully',
                'data' => $payout
            ], 200);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to update payout status',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    private function getUserFromRequest(Request $request)
    {
        if ($request->user_id) {
            return SmmUser::find($request->user_id);
        }

        $token = $request->bearerToken();

        if ($token) {
            return SmmUser::where('api_token', $token)->first();
        }

        return null;
    }
}
