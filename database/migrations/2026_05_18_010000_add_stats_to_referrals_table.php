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
        Schema::table('referrals', function (Blueprint $table) {
            $table->unsignedInteger('visits')->default(0)->after('referral_link');
            $table->unsignedInteger('registrations')->default(0)->after('visits');
            $table->unsignedInteger('referrals_count')->default(0)->after('registrations');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('referrals', function (Blueprint $table) {
            $table->dropColumn(['visits', 'registrations', 'referrals_count']);
        });
    }
};
