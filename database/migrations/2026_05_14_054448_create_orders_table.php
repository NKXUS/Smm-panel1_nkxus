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
        Schema::create('orders', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->constrained('smmusers')->cascadeOnDelete();
    $table->foreignId('service_id')->constrained('services')->cascadeOnDelete();
    $table->string('link');
    $table->integer('quantity');
    $table->decimal('charge', 12, 2);
    $table->integer('start_count')->default(0);
    $table->integer('remains')->default(0);
    $table->enum('status', ['pending', 'in_progress', 'completed', 'partial', 'cancelled'])->default('pending');
    $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
