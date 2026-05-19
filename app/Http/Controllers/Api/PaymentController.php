<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Payment;
use App\Models\Payout;
use App\Models\Referral;
use App\Models\SmmUser;

class PaymentController extends Controller
{
        public function createPayment(Request $request)
    {
        try {

            $request->validate([
                'payout_date' => 'nullable|date',
            ]);

            $payment = Payment::create([
                'user_id' => $request->user_id,
                'amount'  => $request->amount,
                'method'  => $request->method,
                'phone'   => $request->phone,
                'status'  => $request->status,
            ]);

            $commission = 0;
            $autoPayout = null;
            $successfulStatuses = ['success', 'successful', 'completed', 'paid'];

            if (in_array(strtolower((string) $request->status), $successfulStatuses)) {
                $user = SmmUser::find($request->user_id);

                if ($user && $user->referrer_id && (float) $request->amount > 0) {
                    $referral = Referral::firstOrCreate(
                        ['referrer_id' => $user->referrer_id],
                        [
                            'referral_link' => url('/ref/user' . $user->referrer_id),
                            'commission_rate' => 3,
                            'total_earnings' => 0,
                            'available_earnings' => 0,
                            'min_payout' => 10,
                            'conversion_rate' => 0,
                        ]
                    );

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
                'auto_payout' => $autoPayout
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
}
