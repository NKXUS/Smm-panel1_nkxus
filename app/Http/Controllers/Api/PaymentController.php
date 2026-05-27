<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Payment;
use App\Models\Payout;
use App\Models\Referral;
use App\Models\SmmUser;
use Illuminate\Support\Facades\DB;

class PaymentController extends Controller
{
        public function createPayment(Request $request)
    {
        try {

            $request->validate([
                'payout_date' => 'nullable|date',
            ]);

            $commission = 0;
            $autoPayout = null;
            $paymentStatus = strtolower(trim((string) $request->input('status', 'pending')));

            if ($paymentStatus === '') {
                $paymentStatus = 'pending';
            }

            if ($paymentStatus === 'success') {
                $paymentStatus = 'approved';
            }

            if (!in_array($paymentStatus, ['pending', 'approved', 'cancelled'])) {
                return response()->json([
                    'status' => false,
                    'message' => 'Invalid payment status',
                ], 422);
            }

            $status = $paymentStatus;

            $payment = DB::transaction(function () use ($request, $status, $paymentStatus) {
                $payment = Payment::create([
                    'user_id' => $request->user_id,
                    'amount'  => $request->amount,
                    'method'  => $request->method,
                    'phone'   => $request->phone,
                    'status'  => $paymentStatus,
                ]);

                if ($status === 'approved') {
                    $user = SmmUser::find($request->user_id);

                    if ($user && (float) $request->amount > 0) {
                        $user->increment('balance', (float) $request->amount);
                    }
                }

                return $payment;
            });
            $user = SmmUser::find($request->user_id);
            if ($user) {
                $user->refresh();
            }

            if ($status === 'approved') {
                if ($user && $user->referrer_id && (float) $request->amount > 0) {
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

                    $commission = round(((float) $request->amount * (float) $referral->commission_rate) / 100, 2);

                    if ($commission > 0) {
                        $referral->increment('total_earnings', $commission);
                        $referral->increment('available_earnings', $commission);
                        $referral->refresh();

                        if ((float) $referral->min_payout > 0 && (float) $referral->available_earnings >= (float) $referral->min_payout) {
                            $payoutAmount = (float) $referral->available_earnings;

                            $autoPayout = Payout::create([
                                'referral_id' => $referral->id,
                                'amount' => $payoutAmount,
                                'status' => 'pending',
                                'payout_date' => $request->payout_date ?? now()->toDateString(),
                            ]);

                            $referral->decrement('available_earnings', $payoutAmount);
                        }
                    }
                }
            }

            return response()->json([
                'status' => true,
                'message' => 'Payment created successfully',
                'data' => $payment,
                'referral_commission' => $commission,
                'auto_payout' => $autoPayout,
                'user' => $user ? [
                    'id' => $user->id,
                    'username' => $user->username,
                    'email' => $user->email,
                    'balance' => $user->balance,
                ] : null
            ], 201);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to create payment',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    // GET ALL PAYMENTS
    // public function getPayment()
    // {
    //     try {

    //         $payments = Payment::with('user')
    //             ->latest()
    //             ->paginate(10);

    //         return response()->json([
    //             'status' => true,
    //             'message' => 'Payments fetched successfully',

    //             // TOTAL FIRST
    //             'total' => $payments->total(),

    //             // PAGINATION DETAILS
    //             'current_page' => $payments->currentPage(),
    //             'last_page' => $payments->lastPage(),
    //             'per_page' => $payments->perPage(),

    //             // DATA
    //             'data' => $payments->items()

    //         ], 200);

    //     } catch (\Exception $e) {

    //         return response()->json([
    //             'status' => false,
    //             'message' => 'Failed to fetch payments',
    //             'error' => $e->getMessage()
    //         ], 500);
    //     }
    // }
public function getPayment()
{
    try {

        $payments = Payment::with('user')
            ->latest()
            ->paginate(10);

        return response()->json([
            'status' => true,
            'message' => 'Payments fetched successfully',
            'data' => $payments
        ], 200);

    } catch (\Exception $e) {

        return response()->json([
            'status' => false,
            'message' => 'Failed to fetch payments',
            'error' => $e->getMessage()
        ], 500);
    }
}

public function updatePaymentStatus(Request $request)
{
    try {
        $request->validate([
            'payment_id' => 'required_without:id|integer|exists:payments,id',
            'id' => 'required_without:payment_id|integer|exists:payments,id',
            'status' => 'required|in:pending,approved,cancelled',
        ]);

        $paymentId = $request->payment_id ?? $request->id;
        $commission = 0;

        $payment = DB::transaction(function () use ($request, $paymentId, &$commission) {
            $payment = Payment::lockForUpdate()->findOrFail($paymentId);
            $oldStatus = strtolower((string) $payment->status);
            $newStatus = strtolower((string) $request->status);
            $amount = (float) $payment->amount;

            if ($oldStatus === 'success') {
                $oldStatus = 'approved';
            }

            if ($oldStatus !== $newStatus && $amount > 0) {
                $user = SmmUser::lockForUpdate()->find($payment->user_id);

                if (!$user) {
                    abort(404, 'User not found');
                }

                if ($oldStatus !== 'approved' && $newStatus === 'approved') {
                    $user->increment('balance', $amount);
                    $commission = $this->applyReferralCommission($user, $amount, 1);
                }

                if ($oldStatus === 'approved' && $newStatus !== 'approved') {
                    if ($amount > (float) $user->balance) {
                        abort(422, 'Insufficient balance to reverse payment');
                    }

                    $user->decrement('balance', $amount);
                    $commission = $this->applyReferralCommission($user, $amount, -1);
                }
            }

            $payment->update(['status' => $newStatus]);

            return $payment->fresh('user');
        });

        return response()->json([
            'status' => true,
            'message' => 'Payment status updated successfully',
            'data' => $payment,
            'referral_commission' => $commission,
        ], 200);

    } catch (\Throwable $e) {
        $code = method_exists($e, 'getStatusCode') ? $e->getStatusCode() : 500;

        return response()->json([
            'status' => false,
            'message' => $e->getMessage() ?: 'Failed to update payment status',
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
