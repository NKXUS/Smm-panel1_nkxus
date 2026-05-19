<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('smmusers', function (Blueprint $table) {
    $table->id();
    $table->string('username');
    $table->string('email');
    $table->string('password');
    $table->decimal('balance', 12, 2)->default(0);
    $table->string('api_key');
    $table->string('language');
    $table->string('timezone')->default('Asia/Kolkata');
    $table->string('currency');
    $table->boolean('two_fa_enabled')->default(false);
    $table->string('telegram_id');
    $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('smmusers');
    }
};
