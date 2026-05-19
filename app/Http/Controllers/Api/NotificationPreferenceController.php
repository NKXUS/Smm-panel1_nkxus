<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\NotificationPreference;
use Illuminate\Http\Request;

class NotificationPreferenceController extends Controller
{
    public function createNotificationPreference(Request $request)
    {
        try {

            $preference = NotificationPreference::create([
                'user_id' => $request->user_id,
                'type' => $request->type,
                'email_enabled' => $request->email_enabled ?? true,
                'telegram_enabled' => $request->telegram_enabled ?? false,
                'telegram_connected' => $request->telegram_connected ?? false,
            ]);

            return response()->json([
                'status' => true,
                'message' => 'Notification preference created successfully',
                'data' => $preference
            ], 201);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to create notification preference',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function getNotificationPreferences(Request $request)
    {
        try {

            $preferences = NotificationPreference::with('user')
                ->when($request->user_id, function ($query) use ($request) {
                    $query->where('user_id', $request->user_id);
                })
                ->latest()
                ->paginate(10);

            return response()->json([
                'status' => true,
                'message' => 'Notification preferences fetched successfully',
                'data' => $preferences
            ], 200);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to fetch notification preferences',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}
