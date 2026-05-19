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
        Schema::create('support_tickets', function (Blueprint $table) {
    $table->id();
    $table->foreignId('user_id')->constrained('smmusers')->cascadeOnDelete();
    $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
    $table->string('subject');
    $table->text('message');
    $table->enum('status', ['open', 'pending', 'closed'])->default('open');
    $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('support_tickets');
    }
};
