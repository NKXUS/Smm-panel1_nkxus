<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Payout extends Model
{
    protected $fillable = [
        'referral_id',
        'amount',
        'status',
        'payout_date'
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'payout_date' => 'date',
    ];

    public function referral()
    {
        return $this->belongsTo(Referral::class);
    }
}
