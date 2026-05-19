<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Referral extends Model
{
    protected $fillable = [
        'referrer_id',
        'referral_link',
        'visits',
        'registrations',
        'referrals_count',
        'commission_rate',
        'total_earnings',
        'available_earnings',
        'min_payout',
        'conversion_rate'
    ];

    protected $casts = [
        'commission_rate' => 'decimal:2',
        'total_earnings' => 'decimal:2',
        'available_earnings' => 'decimal:2',
        'min_payout' => 'decimal:2',
        'conversion_rate' => 'decimal:2',
    ];

    public function referrer()
    {
        return $this->belongsTo(SmmUser::class, 'referrer_id');
    }
    public function payouts()
{
    return $this->hasMany(Payout::class, 'referral_id');
}
}
