<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('smmusers', function (Blueprint $table) {
            $table->string('google_id')->nullable()->unique()->after('api_token');
            $table->string('google_avatar')->nullable()->after('google_id');
        });
    }

    public function down(): void
    {
        Schema::table('smmusers', function (Blueprint $table) {
            $table->dropColumn(['google_id', 'google_avatar']);
        });
    }
};