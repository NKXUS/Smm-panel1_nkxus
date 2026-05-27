<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SmmUser;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ApiKeyController extends Controller
{
    public function show(Request $request)
    {
        $user = $this->getUserFromRequest($request);

        if (!$user) {
            return response()->json([
                'status' => false,
                'message' => 'Invalid token'
            ], 401);
        }

        if (!$user->api_key) {
            $user->api_key = $this->generateUniqueApiKey();
            $user->save();
        }

        return response()->json([
            'status' => true,
            'api_key' => $user->api_key,
        ]);
    }

    public function regenerate(Request $request)
    {
        $user = $this->getUserFromRequest($request);

        if (!$user) {
            return response()->json([
                'status' => false,
                'message' => 'Invalid token'
            ], 401);
        }

        $user->api_key = $this->generateUniqueApiKey();
        $user->save();

        return response()->json([
            'status' => true,
            'api_key' => $user->api_key,
        ]);
    }

    private function getUserFromRequest(Request $request): ?SmmUser
    {
        $token = $request->bearerToken() ?? $request->api_token;

        if (!$token) {
            return null;
        }

        return SmmUser::where('api_token', $token)->first();
    }

    private function generateUniqueApiKey(): string
    {
        do {
            $apiKey = Str::random(80);
        } while (SmmUser::where('api_key', $apiKey)->exists());

        return $apiKey;
    }
}
