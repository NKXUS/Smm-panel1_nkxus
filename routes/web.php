<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\SmmUserController;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/authorize', [SmmUserController::class, 'handleGoogleCallback']);

Route::get('/callback', [SmmUserController::class, 'handleGoogleCallback']);
