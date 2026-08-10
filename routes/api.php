<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\BlogController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application.
|
*/

// CORS preflight for static admin/page
Route::options('/{any}', [BlogController::class, 'options'])->where('any', '.*');

// Blog APIs

Route::controller(BlogController::class)->group(function () {

    // Get All Blogs
    Route::get('/blogs', 'index');

    // Get Single Blog
    Route::get('/blogs/{id}', 'show');

    // Create Blog
    Route::post('/blogs', 'store');

    // Update Blog
    Route::post('/blogs/{id}', 'update');
    // OR
    // Route::put('/blogs/{id}', 'update');

    // Delete Blog
    Route::delete('/blogs/{id}', 'destroy');
});

// Authenticated User (Default Laravel)
Route::middleware('auth:sanctum')->get('/user', function (Request $request) {
    return $request->user();
});
