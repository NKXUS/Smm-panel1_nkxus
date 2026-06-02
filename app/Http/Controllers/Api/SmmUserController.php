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
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;

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

public function updateProfile(Request $request)
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

        $request->validate([
            'username' => 'required|string|max:255|unique:smmusers,username,' . $user->id,
            'email' => 'required|email|max:255|unique:smmusers,email,' . $user->id,
            'phone_number' => 'nullable|string|max:20',
            'language' => 'nullable|string|max:50',
            'timezone' => 'nullable|string|max:80',
            'currency' => 'nullable|string|max:10',
            'telegram_id' => 'nullable|string|max:100',
            'password' => 'nullable|string|min:6',
            'profile_image' => 'nullable|string',
        ]);

        $updates = [
            'username' => $request->username,
            'email' => $request->email,
            'phone_number' => $request->phone_number,
            'language' => $request->language ?? $user->language,
            'timezone' => $request->timezone ?? $user->timezone,
            'currency' => $request->currency ?? $user->currency,
            'telegram_id' => $request->telegram_id ?? $user->telegram_id,
        ];

        if ($request->filled('password')) {
            $updates['password'] = Hash::make($request->password);
        }

        if ($request->filled('profile_image')) {
            $updates['profile_image'] = $this->storeProfileImage($request->profile_image, $user);
        }

        $user->update($updates);
        $user->refresh();

        return response()->json([
            'status' => true,
            'message' => 'Profile updated successfully',
            'user' => [
                'id' => $user->id,
                'username' => $user->username,
                'email' => $user->email,
                'phone_number' => $user->phone_number,
                'balance' => $user->balance,
                'role' => $user->role,
                'language' => $user->language,
                'timezone' => $user->timezone,
                'currency' => $user->currency,
                'telegram_id' => $user->telegram_id,
                'profile_image' => $this->profileImageUrl($user),
            ],
        ], 200);
    } catch (\Illuminate\Validation\ValidationException $e) {
        return response()->json([
            'status' => false,
            'message' => collect($e->errors())->flatten()->first() ?? 'Invalid profile details',
            'errors' => $e->errors(),
        ], 422);
    } catch (\Throwable $e) {
        return response()->json([
            'status' => false,
            'message' => 'Failed to update profile',
            'error' => $e->getMessage(),
        ], 500);
    }
}

private function storeProfileImage(string $image, SmmUser $user): string
{
    if (preg_match('/^data:image\/(png|jpe?g);base64,/', $image, $matches)) {
        $extension = strtolower($matches[1]) === 'jpeg' ? 'jpg' : strtolower($matches[1]);
        $data = substr($image, strpos($image, ',') + 1);
        $decoded = base64_decode($data, true);

        if ($decoded === false) {
            throw new \InvalidArgumentException('Invalid profile image data');
        }

        $path = 'profile-images/user-' . $user->id . '-' . Str::random(12) . '.' . $extension;
        Storage::disk('public')->put($path, $decoded);

        if ($user->profile_image && !Str::startsWith($user->profile_image, ['http://', 'https://']) && Storage::disk('public')->exists($user->profile_image)) {
            Storage::disk('public')->delete($user->profile_image);
        }

        return $path;
    }

    return $image;
}

private function profileImageUrl(SmmUser $user): ?string
{
    $image = $user->profile_image ?: $user->google_avatar;

    if (!$image) {
        return null;
    }

    if (Str::startsWith($image, ['http://', 'https://', 'data:'])) {
        return $image;
    }

    return Storage::disk('public')->url($image);
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
    $frontendKey = $this->frontendKeyFromRequest($request);
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
            'profile_image' => $this->profileImageUrl($user),
        ],
        'redirect' => $this->loginRedirectUrl($user, null, $frontendKey),
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

        $resetBaseUrl = rtrim(config('app.url'), '/');
        $resetLink = $resetBaseUrl . '/reset-password.html?token=' . $token . '&email=' . urlencode($request->email);
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

public function redirectToGoogle(Request $request)
{
    $returnTo = $this->googleAuthReturnPage($request->query('return_to', 'index.html'));
    $frontendKey = $this->frontendKeyFromRequest($request);

    return Socialite::driver('google')
        ->stateless()
        ->with(['state' => $this->googleAuthState($returnTo, $frontendKey)])
        ->redirect();
}

public function handleGoogleCallback(Request $request)
{
    $state = $this->googleAuthStateFromRequest($request);
    $returnTo = $state['return_to'];
    $frontendKey = $state['frontend'];

    if ($frontendKey === '2' && $returnTo === 'index.html') {
        $returnTo = 'profile.html';
    }

    $frontendUrl = $this->frontendUrl($state['frontend']);

    try {
        $googleUser = Socialite::driver('google')->stateless()->user();
        $email = $googleUser->getEmail();

        if (!$email) {
            return $this->redirectGoogleLoginError('Google account email is required.', $returnTo, $frontendUrl);
        }

        $user = SmmUser::where('google_id', $googleUser->getId())
            ->orWhere('email', $email)
            ->first();

        $token = Str::random(80);
        $name = trim((string) $googleUser->getName()) ?: Str::before($email, '@');

        if ($user) {
            $user->update([
                'google_id' => $googleUser->getId(),
                'google_avatar' => $googleUser->getAvatar(),
                'api_token' => $token,
            ]);
        } else {
            $user = SmmUser::create([
                'username' => $this->uniqueGoogleUsername($name, $email),
                'email' => $email,
                'phone_number' => null,
                'password' => Hash::make(Str::random(32)),
                'balance' => 0,
                'api_key' => Str::random(80),
                'api_token' => $token,
                'role' => 'client',
                'language' => 'english',
                'timezone' => 'Asia/Kolkata',
                'currency' => 'INR',
                'two_fa_enabled' => false,
                'telegram_id' => '',
                'google_id' => $googleUser->getId(),
                'google_avatar' => $googleUser->getAvatar(),
            ]);
        }

        return redirect()->away($this->googleLoginRedirectUrl($user, $token, $returnTo, $frontendUrl, $frontendKey));
    } catch (\Throwable $e) {
        return $this->redirectGoogleLoginError('Google login failed. Please try again.', $returnTo, $frontendUrl);
    }
}

private function googleLoginRedirectUrl(SmmUser $user, string $token, string $returnTo = 'index.html', ?string $frontendUrl = null, string $frontendKey = '1'): string
{
    $frontendUrl = $frontendUrl ? rtrim($frontendUrl, '/') : $this->frontendUrl('1');
    $redirectUrl = $this->loginRedirectUrl($user, $frontendUrl, $frontendKey);
    $payload = rtrim(strtr(base64_encode(json_encode([
        'id' => $user->id,
        'username' => $user->username,
        'email' => $user->email,
        'balance' => $user->balance,
        'role' => $user->role,
        'profile_image' => $this->profileImageUrl($user),
    ])), '+/', '-_'), '=');

    return $frontendUrl . '/' . $returnTo . '#google_auth=success'
        . '&token=' . urlencode($token)
        . '&token_type=Bearer'
        . '&user=' . urlencode($payload)
        . '&redirect=' . urlencode($redirectUrl);
}

private function loginRedirectUrl(SmmUser $user, ?string $frontendUrl = null, string $frontendKey = '1'): string
{
    $frontendUrl = $frontendUrl ? rtrim($frontendUrl, '/') : $this->frontendUrl('1');
    $role = strtolower((string) $user->role);
    $page = $frontendKey === '2' ? 'profile.html' : ($role === 'admin' ? 'admin.html' : 'dashboard.html');

    return $frontendUrl . '/' . $page;
}

private function redirectGoogleLoginError(string $message, string $returnTo = 'index.html', ?string $frontendUrl = null)
{
    $frontendUrl = $frontendUrl ? rtrim($frontendUrl, '/') : $this->frontendUrl('1');

    return redirect()->away($frontendUrl . '/' . $returnTo . '#google_auth=error&message=' . urlencode($message));
}

private function googleAuthStateFromRequest(Request $request): array
{
    $state = (string) $request->query('state', '');

    if (!$state) {
        return ['return_to' => 'index.html', 'frontend' => '1'];
    }

    $decoded = base64_decode(strtr($state, '-_', '+/'), true);
    $payload = json_decode($decoded ?: '', true);

    if (is_array($payload)) {
        return [
            'return_to' => $this->googleAuthReturnPage($payload['return_to'] ?? 'index.html'),
            'frontend' => $this->googleAuthFrontendKey($payload['frontend'] ?? '1'),
        ];
    }

    return [
        'return_to' => $this->googleAuthReturnPage($decoded ?: 'index.html'),
        'frontend' => '1',
    ];
}

private function googleAuthState(string $returnTo, string $frontendKey): string
{
    return rtrim(strtr(base64_encode(json_encode([
        'return_to' => $returnTo,
        'frontend' => $frontendKey,
    ])), '+/', '-_'), '=');
}

private function googleAuthReturnPage(?string $returnTo): string
{
    $page = basename((string) $returnTo);

    return in_array($page, ['index.html', 'signup.html', 'profile.html'], true) ? $page : 'index.html';
}

private function googleAuthFrontendKey(?string $frontend): string
{
    return $frontend === '2' ? '2' : '1';
}

private function frontendKeyFromRequest(Request $request): string
{
    $requestedFrontend = $request->input('frontend', $request->query('frontend'));

    if ($this->googleAuthFrontendKey($requestedFrontend) === '2') {
        return '2';
    }

    $frontendTwoOrigin = $this->urlOrigin($this->frontendUrl('2'));
    $requestOrigin = $this->urlOrigin($request->headers->get('Origin'));
    $requestReferer = $this->urlOrigin($request->headers->get('Referer'));

    return in_array($frontendTwoOrigin, [$requestOrigin, $requestReferer], true) ? '2' : '1';
}

private function frontendUrl(string $frontendKey): string
{
    $envKey = $frontendKey === '2' ? 'FRONTEND_URL_2' : 'FRONTEND_URL';

    return rtrim(env($envKey, env('FRONTEND_URL', config('app.url'))), '/');
}

private function urlOrigin(?string $url): ?string
{
    if (!$url) {
        return null;
    }

    $parts = parse_url($url);

    if (!$parts || empty($parts['scheme']) || empty($parts['host'])) {
        return null;
    }

    $origin = $parts['scheme'] . '://' . $parts['host'];

    if (!empty($parts['port'])) {
        $origin .= ':' . $parts['port'];
    }

    return $origin;
}

private function uniqueGoogleUsername(string $name, string $email): string
{
    $base = Str::slug($name, '_') ?: Str::before($email, '@');
    $base = Str::limit($base, 40, '');
    $username = $base;
    $suffix = 1;

    while (SmmUser::where('username', $username)->exists()) {
        $username = Str::limit($base, 35, '') . '_' . $suffix;
        $suffix++;
    }

    return $username;
}
}





