<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Referral;
use App\Models\SmmUser;
use Illuminate\Http\Request;

class ReferralController extends Controller
{
    public function getReferralDashboard(Request $request)
    {
        try {

            $user = $this->getUserFromRequest($request);

            if (!$user) {
                return response()->json([
                    'status' => false,
                    'message' => 'User not found'
                ], 404);
            }

            $referral = $this->getOrCreateReferral($user);
            $conversionRate = $referral->visits > 0
                ? round(($referral->registrations / $referral->visits) * 100, 2)
                : 0;

            if ((float) $referral->conversion_rate !== $conversionRate) {
                $referral->update([
                    'conversion_rate' => $conversionRate,
                ]);
            }

            return response()->json([
                'status' => true,
                'message' => 'Referral dashboard fetched successfully',
                'data' => [
                    'balance' => $user->balance,
                    'referral_link' => $referral->referral_link,
                    'commission_rate' => $referral->commission_rate,
                    'minimum_payout' => $referral->min_payout,
                    'visits' => $referral->visits,
                    'registrations' => $referral->registrations,
                    'referrals' => $referral->referrals_count,
                    'conversion_rate' => $conversionRate,
                    'total_earnings' => $referral->total_earnings,
                    'available_earnings' => $referral->available_earnings,
                    'payout_history' => $referral->payouts()->latest()->paginate(10),
                ]
            ], 200);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to fetch referral dashboard',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function trackReferralVisit(Request $request)
    {
        try {

            $request->validate([
                'referrer_id' => 'nullable|exists:smmusers,id|required_without:ref',
                'ref' => 'nullable|string|required_without:referrer_id',
            ]);

            $user = $this->getReferrerFromRequest($request);

            if (!$user) {
                return response()->json([
                    'status' => false,
                    'message' => 'Invalid referral code'
                ], 422);
            }

            $referral = $this->getOrCreateReferral($user);

            $referral->increment('visits');

            return response()->json([
                'status' => true,
                'message' => 'Referral visit tracked successfully',
                'data' => $referral->fresh()
            ], 200);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to track referral visit',
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

    private function getReferrerFromRequest(Request $request): ?SmmUser
    {
        if ($request->referrer_id) {
            return SmmUser::find($request->referrer_id);
        }

        if (!$request->ref) {
            return null;
        }

        $referrerId = preg_replace('/\D/', '', (string) $request->ref);

        if (!$referrerId) {
            return null;
        }

        return SmmUser::find($referrerId);
    }

    private function getOrCreateReferral(SmmUser $user)
    {
        $referral = Referral::firstOrCreate(
            ['referrer_id' => $user->id],
            [
                'referral_link' => $this->getReferralLink($user),
                'commission_rate' => 3,
                'total_earnings' => 0,
                'available_earnings' => 0,
                'min_payout' => 10,
                'conversion_rate' => 0,
            ]
        );

        $referralLink = $this->getReferralLink($user);

        if ($referral->referral_link !== $referralLink) {
            $referral->update([
                'referral_link' => $referralLink,
            ]);
        }

        return $referral;
    }

    private function getReferralLink(SmmUser $user): string
    {
        $frontendUrl = rtrim(env('FRONTEND_URL', config('app.url')), '/');

        return $frontendUrl . '/signup.html?ref=' . $user->id;
    }
}
