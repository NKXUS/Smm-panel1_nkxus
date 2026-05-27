<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\Referral;
use App\Models\SmmUser;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class SmmUserController extends Controller
{
   
    public function getUsers(Request $request)
{
    $token = $request->bearerToken() ?? $request->api_token;
    $requestUser = $token ? SmmUser::where('api_token', $token)->first() : null;
    $isAdmin = strtolower((string) $requestUser?->role) === 'admin';

    $users = SmmUser::paginate(10);

    if ($isAdmin) {
        $users->getCollection()->transform(function (SmmUser $user) {
            if (!$user->api_key) {
                $user->api_key = Str::random(80);
                $user->save();
            }

            return $user->makeVisible('api_key');
        });
    }

    return response()->json([
        'status' => true,
        'total_users' => $users->total(),
        'data' => $users
    ]);
}
  
    public function createUser(Request $request)
{
    $user = SmmUser::create([
        'username' => $request->username,
        'email' => $request->email,
        'phone_number'=>$request->phone_number,
        'password' => Hash::make($request->password),
        'balance' => $request->balance,
        'api_key' => $request->api_key ?? Str::random(80),
        'role' => 'client',
        'language' => $request->language,
        'timezone' => $request->timezone,
        'currency' => $request->currency,
        'two_fa_enabled' => $request->two_fa_enabled,
        'telegram_id' => $request->telegram_id,
    ]);

    return response()->json([
        'status' => true,
        'data' => $user
    ]);
}

public function signUp(Request $request)
{
    $request->validate([
        'username' => 'required|string|max:255',
        'email' => 'required|email|max:255',
        'phone_number' => 'nullable|string|max:20',
        'password' => 'required|string|min:6',
        'language' => 'nullable|string|max:50',
        'currency' => 'nullable|string|max:10',
        'referrer_id' => 'nullable|exists:smmusers,id',
        'ref' => 'nullable|string',
    ]);

    $existingUser = SmmUser::where('email', $request->email)
        ->orWhere('username', $request->username)
        // ->orWhere('phone_number', $request->phone_number)
        ->first();

    if ($existingUser) {
        return response()->json([
            'status' => false,
            'message' => 'User already exists'
        ], 409);
    }

    $referrer = $this->getReferrerFromRequest($request);

    if (($request->filled('referrer_id') || $request->filled('ref')) && !$referrer) {
        return response()->json([
            'status' => false,
            'message' => 'Invalid referral code'
        ], 422);
    }

    $user = DB::transaction(function () use ($request, $referrer) {
        $user = SmmUser::create([
            'username' => $request->username,
            'email' => $request->email,
            'phone_number' => $request->phone_number,
            'password' => Hash::make($request->password),
            'api_key' => Str::random(80),
            'role' => 'client',
            'language' => $request->language ?? 'english',
            'currency' => $request->currency ?? 'INR',
            'referrer_id' => $referrer?->id,
        ]);

        if ($referrer) {
            $referral = Referral::firstOrCreate(
                ['referrer_id' => $referrer->id],
                [
                    'referral_link' => $this->getReferralLink($referrer),
                    'commission_rate' => 3,
                    'total_earnings' => 0,
                    'available_earnings' => 0,
                    'min_payout' => 10,
                    'conversion_rate' => 0,
                ]
            );

            $referralLink = $this->getReferralLink($referrer);

            if ($referral->referral_link !== $referralLink) {
                $referral->update([
                    'referral_link' => $referralLink,
                ]);
            }

            $referral->increment('registrations');
            $referral->increment('referrals_count');
        }

        return $user;
    });

    return response()->json([
        'status' => true,
        'message' => 'User registered successfully',
        'data' => $user
    ], 201);
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

private function getReferralLink(SmmUser $user): string
{
    $frontendUrl = rtrim(env('FRONTEND_URL', config('app.url')), '/');

    return $frontendUrl . '/signup.html?ref=' . $user->id;
}

public function signIn(Request $request)
{
    $user = SmmUser::where('email', $request->email)->first();

    // Check user exists
    if (!$user) {
        return response()->json([
            'status' => false,
            'message' => 'User not found'
        ], 404);
    }

    // Check password
    if (!Hash::check($request->password, $user->password)) {
        return response()->json([
            'status' => false,
            'message' => 'Invalid password'
        ], 401);
    }

    $token = Str::random(80);

    $user->update([
        'api_token' => $token,
    ]);

    // Login success
    return response()->json([
        'status' => true,
        'message' => 'Login successful',
        'token' => $token,
        'token_type' => 'Bearer',
        'user' => [
            'id' => $user->id,
            'username' => $user->username,
            'email' => $user->email,
            'balance' => $user->balance,
            'role' => $user->role,
        ],
        'redirect' => '/dashboard.html'
    ]);
}

public function logout(Request $request)
{
    try {

        $token = $request->bearerToken() ?? $request->api_token;

        if (!$token) {
            return response()->json([
                'status' => false,
                'message' => 'Token is required'
            ], 401);
        }

        $user = SmmUser::where('api_token', $token)->first();

        if (!$user) {
            return response()->json([
                'status' => false,
                'message' => 'Invalid token'
            ], 401);
        }

        $user->update([
            'api_token' => null,
        ]);

        return response()->json([
            'status' => true,
            'message' => 'Logout successful',
                'redirect' => '/index.html'
            ], 200);

    } catch (\Exception $e) {

        return response()->json([
            'status' => false,
            'message' => 'Failed to logout',
            'error' => $e->getMessage()
        ], 500);
    }
}

public function forgotPassword(Request $request)
{
    try {

        $request->validate([
            'email' => 'required|email',
        ]);

        $user = SmmUser::where('email', $request->email)->first();

        if (!$user) {
            return response()->json([
                'status' => false,
                'message' => 'User not found'
            ], 404);
        }

        $token = Str::random(64);

        DB::table('password_reset_tokens')->updateOrInsert(
            ['email' => $request->email],
            [
                'token' => Hash::make($token),
                'created_at' => Carbon::now()
            ]
        );

        $frontendUrl = rtrim(env('FRONTEND_URL', config('app.url')), '/');
        $resetLink = $frontendUrl . '/reset-password.html?token=' . $token . '&email=' . urlencode($request->email);
        $safeUsername = e($user->username);
        $safeResetLink = e($resetLink);

        $emailContent = <<<HTML
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#f6f7fb;font-family:Arial,sans-serif;color:#1f2937;">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
        <div style="background-color:#ffffff;border-radius:8px;padding:28px;border:1px solid #e5e7eb;">
            <h2 style="margin:0 0 16px;font-size:22px;color:#111827;">Reset your password</h2>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello {$safeUsername},</p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
                Click the button below to create a new password for your account.
            </p>
            <a href="{$safeResetLink}" style="display:inline-block;background-color:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:15px;font-weight:bold;">
                Reset Password
            </a>
            <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
                If the button does not work, copy and paste this link into your browser:<br>
                <a href="{$safeResetLink}" style="color:#2563eb;word-break:break-all;">{$safeResetLink}</a>
            </p>
            <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
                If you did not request this, please ignore this email.
            </p>
        </div>
    </div>
</body>
</html>
HTML;

        Mail::html($emailContent, function ($message) use ($request) {
            $message->to($request->email)
                ->subject('Reset your password');
        });

        return response()->json([
            'status' => true,
            'message' => 'Password reset email sent successfully',
            'token' => $token,
            'reset_link' => $resetLink
        ], 200);

    } catch (\Exception $e) {

        return response()->json([
            'status' => false,
            'message' => 'Failed to send password reset email',
            'error' => $e->getMessage()
        ], 500);
    }
}

public function resetPassword(Request $request)
{
    try {

        $request->validate([
            'email' => 'required|email',
            'token' => 'required',
            'password' => 'required|min:6',
        ]);

        $resetToken = DB::table('password_reset_tokens')
            ->where('email', $request->email)
            ->first();

        if (!$resetToken || !Hash::check($request->token, $resetToken->token)) {
            return response()->json([
                'status' => false,
                'message' => 'Invalid reset token'
            ], 400);
        }

        if (Carbon::parse($resetToken->created_at)->addMinutes(60)->isPast()) {
            DB::table('password_reset_tokens')->where('email', $request->email)->delete();

            return response()->json([
                'status' => false,
                'message' => 'Reset token expired'
            ], 400);
        }

        $user = SmmUser::where('email', $request->email)->first();

        if (!$user) {
            return response()->json([
                'status' => false,
                'message' => 'User not found'
            ], 404);
        }

        $user->update([
            'password' => Hash::make($request->password),
        ]);

        DB::table('password_reset_tokens')->where('email', $request->email)->delete();

        return response()->json([
            'status' => true,
            'message' => 'Password reset successfully',
            'redirect' => '/index.html'
        ], 200);

    } catch (\Exception $e) {

        return response()->json([
            'status' => false,
            'message' => 'Failed to reset password',
            'error' => $e->getMessage()
        ], 500);
    }
}

}
