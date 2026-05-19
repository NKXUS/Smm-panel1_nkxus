<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WhatsAppWidget;
use Illuminate\Http\Request;

class WhatsAppWidgetController extends Controller
{
    public function createWhatsAppWidget(Request $request)
    {
        try {

            $widget = WhatsAppWidget::create([
                'phone_number' => $request->phone_number,
                'greeting_message' => $request->greeting_message,
                'is_active' => $request->is_active ?? true,
            ]);

            return response()->json([
                'status' => true,
                'message' => 'WhatsApp widget created successfully',
                'data' => $widget
            ], 201);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to create WhatsApp widget',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function getWhatsAppWidgets()
    {
        try {

            $widgets = WhatsAppWidget::latest()->paginate(10);

            return response()->json([
                'status' => true,
                'message' => 'WhatsApp widgets fetched successfully',
                'data' => $widgets
            ], 200);

        } catch (\Exception $e) {

            return response()->json([
                'status' => false,
                'message' => 'Failed to fetch WhatsApp widgets',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}
