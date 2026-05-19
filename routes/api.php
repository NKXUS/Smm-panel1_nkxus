<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\ServiceCategoryController;
use App\Http\Controllers\Api\ServiceController;
use App\Http\Controllers\Api\SmmUserController;
use App\Http\Controllers\Api\NotificationPreferenceController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PayoutController;
use App\Http\Controllers\Api\MassOrderController;
use App\Http\Controllers\Api\ReferralController;
use App\Http\Controllers\Api\SupportTicketController;
use App\Http\Controllers\Api\WhatsAppWidgetController;


Route::get('/test', function () {
    return response()->json([
        'message' => 'API Working'
    ]);
});

Route::get('/get_users', [SmmUserController::class, 'getUsers']);

Route::post('/create_user', [SmmUserController::class, 'createUser']);

Route::post('/sign_up', [SmmUserController::class, 'signUp']);

Route::post('/sign_in', [SmmUserController::class, 'signIn']);

Route::post('/logout', [SmmUserController::class, 'logout']);

Route::post('/forgot_password', [SmmUserController::class, 'forgotPassword']);

Route::post('/reset_password', [SmmUserController::class, 'resetPassword']);

Route::post('/create_notification_preference', [NotificationPreferenceController::class, 'createNotificationPreference']);

Route::get('/get_notification_preferences', [NotificationPreferenceController::class, 'getNotificationPreferences']);

Route::get('/get_categories', [ServiceCategoryController::class, 'getCategories']);

Route::post('/create_category', [ServiceCategoryController::class, 'createCategory']);

Route::get('/get_categoryname', [ServiceCategoryController::class, 'getcategoryname']);

Route::post('/create_service', [ServiceController::class, 'createService']);

Route::get('/get_services', [ServiceController::class, 'getServices']);

Route::post('/create_order', [OrderController::class, 'createOrder']);

Route::get('/get_orders', [OrderController::class, 'getOrders']);

Route::post('/create_payment', [PaymentController::class, 'createPayment']);

Route::get('/get_payments', [PaymentController::class, 'getPayment']);

Route::post('/create_payout', [PayoutController::class, 'createPayout']);

Route::get('/get_payouts', [PayoutController::class, 'getPayouts']);

Route::post('/update_payout_status', [PayoutController::class, 'updatePayoutStatus']);

Route::post('/createmassorder', [MassOrderController::class, 'createMassOrder']);

Route::get('/getmassorder', [MassOrderController::class, 'getMassOrders']);

Route::get('/referral_dashboard', [ReferralController::class, 'getReferralDashboard']);

Route::post('/track_referral_visit', [ReferralController::class, 'trackReferralVisit']);

Route::post('/createsupporttickets', [SupportTicketController::class, 'createSupportTicket']);

Route::get('/getsupporttickets', [SupportTicketController::class, 'getSupportTickets']);

Route::post('/createwhatsappwidget', [WhatsAppWidgetController::class, 'createWhatsAppWidget']);

Route::get('/getwhatsappwidgets', [WhatsAppWidgetController::class, 'getWhatsAppWidgets']);
